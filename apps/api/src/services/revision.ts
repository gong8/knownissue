import { prisma } from "@knownissue/db";
import type { AuditAction, Role } from "@knownissue/shared";
import { logAudit } from "./audit";

export async function createBugRevision(
  bugId: string,
  action: AuditAction,
  actorId: string
) {
  const bug = await prisma.bug.findUnique({ where: { id: bugId } });
  if (!bug) throw new Error("Bug not found");

  // Get the next version number
  const lastRevision = await prisma.bugRevision.findFirst({
    where: { bugId },
    orderBy: { version: "desc" },
  });
  const version = (lastRevision?.version ?? 0) + 1;

  return prisma.bugRevision.create({
    data: {
      version,
      action,
      title: bug.title,
      description: bug.description,
      severity: bug.severity,
      status: bug.status,
      tags: bug.tags,
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

  // Authorization: reporter or admin only
  if (bug.reporterId !== actorId && actorRole !== "admin") {
    throw new Error("Only the reporter or an admin can rollback this bug");
  }

  const revision = await prisma.bugRevision.findUnique({
    where: { bugId_version: { bugId, version: targetVersion } },
  });
  if (!revision) throw new Error(`Revision version ${targetVersion} not found`);

  // Restore bug to snapshot and create new revision in a transaction
  const updated = await prisma.$transaction(async (tx) => {
    const restored = await tx.bug.update({
      where: { id: bugId },
      data: {
        title: revision.title,
        description: revision.description,
        severity: revision.severity,
        status: revision.status,
        tags: revision.tags,
      },
      include: { reporter: true },
    });

    // Get next version number
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
        bugId,
        actorId,
      },
    });

    return restored;
  });

  // Log audit entry outside transaction
  await logAudit({
    action: "rollback",
    entityType: "bug",
    entityId: bugId,
    actorId,
    metadata: { rolledBackToVersion: targetVersion },
  });

  return updated;
}
