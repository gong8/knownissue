import { prisma, type Prisma } from "@knownissue/db";
import type { IssueRelationType } from "@knownissue/shared";
import { logAudit } from "./audit";

const SYMMETRIC_TYPES: IssueRelationType[] = [
  "same_root_cause",
  "interaction_conflict",
  "shared_fix",
  "fix_conflict",
];

/**
 * Create an issue relation. For symmetric types, source is always the older issue.
 * Idempotent — silently skips if the relation already exists.
 */
export async function createRelation(params: {
  sourceIssueId: string;
  targetIssueId: string;
  type: IssueRelationType;
  source: "agent" | "system";
  confidence: number;
  metadata?: Record<string, unknown>;
  createdById?: string;
}): Promise<boolean> {
  let { sourceIssueId, targetIssueId } = params;

  // For symmetric types, enforce older issue = source
  if (SYMMETRIC_TYPES.includes(params.type)) {
    const [sourceIssue, targetIssue] = await Promise.all([
      prisma.issue.findUnique({ where: { id: sourceIssueId }, select: { createdAt: true } }),
      prisma.issue.findUnique({ where: { id: targetIssueId }, select: { createdAt: true } }),
    ]);
    if (!sourceIssue || !targetIssue) return false;
    if (sourceIssue.createdAt > targetIssue.createdAt) {
      [sourceIssueId, targetIssueId] = [targetIssueId, sourceIssueId];
    }
  }

  // Prevent self-relations
  if (sourceIssueId === targetIssueId) return false;

  try {
    await prisma.issueRelation.create({
      data: {
        type: params.type,
        source: params.source,
        confidence: params.confidence,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
        sourceIssueId,
        targetIssueId,
        createdById: params.createdById ?? null,
      },
    });

    await logAudit({
      action: "create",
      entityType: "issue",
      entityId: sourceIssueId,
      actorId: params.createdById ?? "system",
      metadata: {
        relationType: params.type,
        targetIssueId,
        source: params.source,
        confidence: params.confidence,
      },
    });

    return true;
  } catch {
    // Unique constraint violation — relation already exists
    return false;
  }
}

/**
 * Load related issues for a set of issueIds. Returns a map of issueId -> related issues.
 * Used by search and get_patch to inline relations in responses.
 */
export async function loadRelatedIssues(
  issueIds: string[],
  options: { minConfidence?: number; maxPerBug?: number } = {}
): Promise<Map<string, Array<{
  issueId: string;
  title: string | null;
  library: string | null;
  version: string | null;
  relationType: IssueRelationType;
  confidence: number;
  source: "agent" | "system";
  metadata: Record<string, unknown> | null;
  sharedPatchId?: string;
}>>> {
  const { minConfidence = 0.7, maxPerBug = 3 } = options;

  if (issueIds.length === 0) return new Map();

  const relations = await prisma.issueRelation.findMany({
    where: {
      AND: [
        { confidence: { gte: minConfidence } },
        {
          OR: [
            { sourceIssueId: { in: issueIds } },
            { targetIssueId: { in: issueIds } },
          ],
        },
      ],
    },
    include: {
      sourceIssue: { select: { id: true, title: true, library: true, version: true } },
      targetIssue: { select: { id: true, title: true, library: true, version: true } },
    },
    orderBy: { confidence: "desc" },
  });

  const result = new Map<string, Array<{
    issueId: string;
    title: string | null;
    library: string | null;
    version: string | null;
    relationType: IssueRelationType;
    confidence: number;
    source: "agent" | "system";
    metadata: Record<string, unknown> | null;
    sharedPatchId?: string;
  }>>();

  for (const rel of relations) {
    const sides: Array<{ ours: string; related: typeof rel.sourceIssue }> = [];

    if (issueIds.includes(rel.sourceIssueId)) {
      sides.push({ ours: rel.sourceIssueId, related: rel.targetIssue });
    }
    if (issueIds.includes(rel.targetIssueId)) {
      sides.push({ ours: rel.targetIssueId, related: rel.sourceIssue });
    }

    const meta = rel.metadata as Record<string, unknown> | null;
    const sharedPatchId =
      rel.type === "shared_fix" && meta && typeof meta.patchId === "string"
        ? meta.patchId
        : undefined;

    for (const { ours, related } of sides) {
      const list = result.get(ours) ?? [];
      if (list.length >= maxPerBug) continue;
      list.push({
        issueId: related.id,
        title: related.title,
        library: related.library,
        version: related.version,
        relationType: rel.type as IssueRelationType,
        confidence: rel.confidence,
        source: rel.source as "agent" | "system",
        metadata: meta,
        ...(sharedPatchId !== undefined && { sharedPatchId }),
      });
      result.set(ours, list);
    }
  }

  return result;
}
