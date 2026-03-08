import { prisma } from "@knownissue/db";
import { PATCH_REWARD } from "@knownissue/shared";
import type { PatchStep } from "@knownissue/shared";
import { awardCredits } from "./credits";
import { logAudit } from "./audit";
import { computeDerivedStatus } from "./bug";

export async function submitPatch(
  bugId: string,
  explanation: string,
  steps: PatchStep[],
  versionConstraint: string | null | undefined,
  userId: string
) {
  const bug = await prisma.bug.findUnique({ where: { id: bugId } });
  if (!bug) {
    throw new Error("Bug not found");
  }

  const patch = await prisma.patch.create({
    data: {
      explanation,
      steps: steps as unknown as import("@knownissue/db").Prisma.InputJsonValue,
      versionConstraint: versionConstraint ?? null,
      bugId,
      submitterId: userId,
    },
    include: {
      submitter: true,
      bug: { select: { title: true } },
    },
  });

  const newBalance = await awardCredits(userId, PATCH_REWARD, "patch_submitted", {
    bugId,
    patchId: patch.id,
  });

  await logAudit({
    action: "create",
    entityType: "patch",
    entityId: patch.id,
    actorId: userId,
    metadata: { bugId },
  });

  // Recompute derived status after new patch
  await computeDerivedStatus(bugId);

  return { ...patch, creditsAwarded: PATCH_REWARD, creditsBalance: newBalance };
}

export async function getPatchById(id: string) {
  return prisma.patch.findUnique({
    where: { id },
    include: {
      submitter: true,
      bug: { select: { id: true, title: true } },
      reviews: {
        include: { reviewer: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function getUserPatches(userId: string) {
  return prisma.patch.findMany({
    where: { submitterId: userId },
    include: {
      bug: { select: { id: true, title: true } },
      _count: { select: { reviews: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
