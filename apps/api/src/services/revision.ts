import { prisma, type Prisma } from "@knownissue/db";
import type { AuditAction, Role } from "@knownissue/shared";
import { logAudit } from "./audit";

export async function createBugRevision(
  bugId: string,
  action: AuditAction,
  actorId: string
) {
  const bug = await prisma.bug.findUnique({ where: { id: bugId } });
  if (!bug) throw new Error("Bug not found");

  const lastRevision = await prisma.bugRevision.findFirst({
    where: { bugId },
    orderBy: { version: "desc" },
  });
  const version = (lastRevision?.version ?? 0) + 1;

  // Store new fields in snapshot Json column
  const snapshot: Prisma.InputJsonObject = {
    errorMessage: bug.errorMessage,
    errorCode: bug.errorCode,
    stackTrace: bug.stackTrace,
    fingerprint: bug.fingerprint,
    triggerCode: bug.triggerCode,
    expectedBehavior: bug.expectedBehavior,
    actualBehavior: bug.actualBehavior,
    context: bug.context as Prisma.InputJsonValue ?? null,
    contextLibraries: bug.contextLibraries,
    runtime: bug.runtime,
    platform: bug.platform,
    category: bug.category,
    confirmedCount: bug.confirmedCount,
    searchHitCount: bug.searchHitCount,
  };

  return prisma.bugRevision.create({
    data: {
      version,
      action,
      title: bug.title ?? "",
      description: bug.description ?? "",
      severity: bug.severity,
      status: bug.status,
      tags: bug.tags,
      snapshot,
      bugId,
      actorId,
    },
  });
}

export async function getBugRevisions(
  bugId: string,
  params: { limit?: number; offset?: number } = {}
) {
  const { limit = 10, offset = 0 } = params;

  const [revisions, total] = await Promise.all([
    prisma.bugRevision.findMany({
      where: { bugId },
      orderBy: { version: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.bugRevision.count({ where: { bugId } }),
  ]);

  return { revisions, total };
}

export async function getBugRevision(bugId: string, version: number) {
  return prisma.bugRevision.findUnique({
    where: { bugId_version: { bugId, version } },
  });
}

export async function rollbackBug(
  bugId: string,
  targetVersion: number,
  actorId: string,
  actorRole: Role
) {
  const bug = await prisma.bug.findUnique({ where: { id: bugId } });
  if (!bug) throw new Error("Bug not found");

  if (bug.reporterId !== actorId && actorRole !== "admin") {
    throw new Error("Only the reporter or an admin can rollback this bug");
  }

  const revision = await prisma.bugRevision.findUnique({
    where: { bugId_version: { bugId, version: targetVersion } },
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

    const restored = await tx.bug.update({
      where: { id: bugId },
      data: restoreData,
      include: { reporter: true },
    });

    const lastRevision = await tx.bugRevision.findFirst({
      where: { bugId },
      orderBy: { version: "desc" },
    });
    const newVersion = (lastRevision?.version ?? 0) + 1;

    await tx.bugRevision.create({
      data: {
        version: newVersion,
        action: "rollback",
        title: revision.title,
        description: revision.description,
        severity: revision.severity,
        status: revision.status,
        tags: revision.tags,
        snapshot: snapshotData as Prisma.InputJsonValue ?? undefined,
        bugId,
        actorId,
      },
    });

    return restored;
  });

  await logAudit({
    action: "rollback",
    entityType: "bug",
    entityId: bugId,
    actorId,
    metadata: { rolledBackToVersion: targetVersion },
  });

  return updated;
}
