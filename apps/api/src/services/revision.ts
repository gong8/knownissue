import { prisma, type Prisma } from "@knownissue/db";
import type { AuditAction, Role } from "@knownissue/shared";
import { logAudit } from "./audit";

export async function createIssueRevision(
  issueId: string,
  action: AuditAction,
  actorId: string
) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new Error("Issue not found");

  const lastRevision = await prisma.issueRevision.findFirst({
    where: { issueId },
    orderBy: { version: "desc" },
  });
  const version = (lastRevision?.version ?? 0) + 1;

  // Store new fields in snapshot Json column
  const snapshot: Prisma.InputJsonObject = {
    errorMessage: issue.errorMessage,
    errorCode: issue.errorCode,
    stackTrace: issue.stackTrace,
    fingerprint: issue.fingerprint,
    triggerCode: issue.triggerCode,
    expectedBehavior: issue.expectedBehavior,
    actualBehavior: issue.actualBehavior,
    context: issue.context as Prisma.InputJsonValue ?? null,
    contextLibraries: issue.contextLibraries,
    runtime: issue.runtime,
    platform: issue.platform,
    category: issue.category,
    accessCount: issue.accessCount,
    searchHitCount: issue.searchHitCount,
  };

  return prisma.issueRevision.create({
    data: {
      version,
      action,
      title: issue.title ?? "",
      description: issue.description ?? "",
      severity: issue.severity,
      status: issue.status,
      tags: issue.tags,
      snapshot,
      issueId,
      actorId,
    },
  });
}

export async function getIssueRevisions(
  issueId: string,
  params: { limit?: number; offset?: number } = {}
) {
  const { limit = 10, offset = 0 } = params;

  const [revisions, total] = await Promise.all([
    prisma.issueRevision.findMany({
      where: { issueId },
      orderBy: { version: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.issueRevision.count({ where: { issueId } }),
  ]);

  return { revisions, total };
}

export async function getIssueRevision(issueId: string, version: number) {
  return prisma.issueRevision.findUnique({
    where: { issueId_version: { issueId, version } },
  });
}

export async function rollbackIssue(
  issueId: string,
  targetVersion: number,
  actorId: string,
  actorRole: Role
) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new Error("Issue not found");

  if (issue.reporterId !== actorId && actorRole !== "admin") {
    throw new Error("Only the reporter or an admin can rollback this issue");
  }

  const revision = await prisma.issueRevision.findUnique({
    where: { issueId_version: { issueId, version: targetVersion } },
  });
  if (!revision) throw new Error(`Revision version ${targetVersion} not found`);

  // Restore from snapshot if available, otherwise from individual columns
  const snapshotData = revision.snapshot as Record<string, unknown> | null;

  const updated = await prisma.$transaction(async (tx) => {
    const restoreData: Record<string, unknown> = {
      title: revision.title,
      description: revision.description,
      severity: revision.severity,
      status: revision.status,
      tags: revision.tags,
    };

    // Restore new fields from snapshot if present
    if (snapshotData) {
      restoreData.errorMessage = snapshotData.errorMessage ?? null;
      restoreData.errorCode = snapshotData.errorCode ?? null;
      restoreData.stackTrace = snapshotData.stackTrace ?? null;
      restoreData.triggerCode = snapshotData.triggerCode ?? null;
      restoreData.expectedBehavior = snapshotData.expectedBehavior ?? null;
      restoreData.actualBehavior = snapshotData.actualBehavior ?? null;
      restoreData.context = snapshotData.context ?? undefined;
      restoreData.contextLibraries = snapshotData.contextLibraries ?? [];
      restoreData.runtime = snapshotData.runtime ?? null;
      restoreData.platform = snapshotData.platform ?? null;
      restoreData.category = snapshotData.category ?? null;
    }

    const restored = await tx.issue.update({
      where: { id: issueId },
      data: restoreData,
      include: { reporter: true },
    });

    const lastRevision = await tx.issueRevision.findFirst({
      where: { issueId },
      orderBy: { version: "desc" },
    });
    const newVersion = (lastRevision?.version ?? 0) + 1;

    await tx.issueRevision.create({
      data: {
        version: newVersion,
        action: "rollback",
        title: revision.title,
        description: revision.description,
        severity: revision.severity,
        status: revision.status,
        tags: revision.tags,
        snapshot: snapshotData as Prisma.InputJsonValue ?? undefined,
        issueId,
        actorId,
      },
    });

    return restored;
  });

  await logAudit({
    action: "rollback",
    entityType: "issue",
    entityId: issueId,
    actorId,
    metadata: { rolledBackToVersion: targetVersion },
  });

  return updated;
}
