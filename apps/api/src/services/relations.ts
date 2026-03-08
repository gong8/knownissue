import { prisma, type Prisma } from "@knownissue/db";
import type { BugRelationType } from "@knownissue/shared";
import { logAudit } from "./audit";

const SYMMETRIC_TYPES: BugRelationType[] = [
  "same_root_cause",
  "interaction_conflict",
  "shared_fix",
  "fix_conflict",
];

/**
 * Create a bug relation. For symmetric types, source is always the older bug.
 * Idempotent — silently skips if the relation already exists.
 */
export async function createRelation(params: {
  sourceBugId: string;
  targetBugId: string;
  type: BugRelationType;
  source: "agent" | "system";
  confidence: number;
  metadata?: Record<string, unknown>;
  createdById?: string;
}): Promise<boolean> {
  let { sourceBugId, targetBugId } = params;

  // For symmetric types, enforce older bug = source
  if (SYMMETRIC_TYPES.includes(params.type)) {
    const [sourceBug, targetBug] = await Promise.all([
      prisma.bug.findUnique({ where: { id: sourceBugId }, select: { createdAt: true } }),
      prisma.bug.findUnique({ where: { id: targetBugId }, select: { createdAt: true } }),
    ]);
    if (!sourceBug || !targetBug) return false;
    if (sourceBug.createdAt > targetBug.createdAt) {
      [sourceBugId, targetBugId] = [targetBugId, sourceBugId];
    }
  }

  // Prevent self-relations
  if (sourceBugId === targetBugId) return false;

  try {
    await prisma.bugRelation.create({
      data: {
        type: params.type,
        source: params.source,
        confidence: params.confidence,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
        sourceBugId,
        targetBugId,
        createdById: params.createdById ?? null,
      },
    });

    await logAudit({
      action: "create",
      entityType: "bug",
      entityId: sourceBugId,
      actorId: params.createdById ?? "system",
      metadata: {
        relationType: params.type,
        targetBugId,
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
 * Load related bugs for a set of bugIds. Returns a map of bugId -> related bugs.
 * Used by search and get_patch to inline relations in responses.
 */
export async function loadRelatedBugs(
  bugIds: string[],
  options: { minConfidence?: number; maxPerBug?: number } = {}
): Promise<Map<string, Array<{
  bugId: string;
  title: string | null;
  library: string;
  version: string;
  relationType: BugRelationType;
  confidence: number;
  source: "agent" | "system";
  metadata: Record<string, unknown> | null;
}>>> {
  const { minConfidence = 0.7, maxPerBug = 3 } = options;

  if (bugIds.length === 0) return new Map();

  const relations = await prisma.bugRelation.findMany({
    where: {
      AND: [
        { confidence: { gte: minConfidence } },
        {
          OR: [
            { sourceBugId: { in: bugIds } },
            { targetBugId: { in: bugIds } },
          ],
        },
      ],
    },
    include: {
      sourceBug: { select: { id: true, title: true, library: true, version: true } },
      targetBug: { select: { id: true, title: true, library: true, version: true } },
    },
    orderBy: { confidence: "desc" },
  });

  const result = new Map<string, Array<{
    bugId: string;
    title: string | null;
    library: string;
    version: string;
    relationType: BugRelationType;
    confidence: number;
    source: "agent" | "system";
    metadata: Record<string, unknown> | null;
  }>>();

  for (const rel of relations) {
    const sides: Array<{ ours: string; related: typeof rel.sourceBug }> = [];

    if (bugIds.includes(rel.sourceBugId)) {
      sides.push({ ours: rel.sourceBugId, related: rel.targetBug });
    }
    if (bugIds.includes(rel.targetBugId)) {
      sides.push({ ours: rel.targetBugId, related: rel.sourceBug });
    }

    for (const { ours, related } of sides) {
      const list = result.get(ours) ?? [];
      if (list.length >= maxPerBug) continue;
      list.push({
        bugId: related.id,
        title: related.title,
        library: related.library,
        version: related.version,
        relationType: rel.type as BugRelationType,
        confidence: rel.confidence,
        source: rel.source as "agent" | "system",
        metadata: rel.metadata as Record<string, unknown> | null,
      });
      result.set(ours, list);
    }
  }

  return result;
}
