import { prisma, type Prisma } from "@knownissue/db";
import type { AuditAction, EntityType } from "@knownissue/shared";

export async function logAudit(params: {
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  actorId: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditLog.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      actorId: params.actorId,
      changes: (params.changes as Prisma.InputJsonValue) ?? undefined,
      metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

export async function getEntityAuditLog(
  entityType: EntityType,
  entityId: string,
  params: { limit?: number; offset?: number } = {}
) {
  const { limit = 20, offset = 0 } = params;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where: { entityType, entityId } }),
  ]);

  return { logs, total };
}

export async function getUserAuditLog(
  actorId: string,
  params: { limit?: number; offset?: number } = {}
) {
  const { limit = 20, offset = 0 } = params;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { actorId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where: { actorId } }),
  ]);

  return { logs, total };
}
