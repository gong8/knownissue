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
      verifications: {
        include: { verifier: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function getPatchForAgent(patchId: string, userId: string) {
  const patch = await prisma.patch.findUnique({
    where: { id: patchId },
    include: {
      submitter: true,
      bug: { select: { id: true, title: true, library: true, version: true } },
      verifications: {
        include: { verifier: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!patch) {
    throw new Error("Patch not found");
  }

  // Idempotent: try to create PatchAccess, ignore if already exists
  try {
    await prisma.$transaction(async (tx) => {
      await tx.patchAccess.create({
        data: { patchId, userId },
      });

      // Increment accessCount on the bug
      await tx.bug.update({
        where: { id: patch.bugId },
        data: { accessCount: { increment: 1 } },
      });
    });

    // Recompute derived status after accessCount change
    await computeDerivedStatus(patch.bugId);
  } catch {
    // Unique constraint violation — access already recorded, do nothing
  }

  return patch;
}

export async function getUserPatches(userId: string) {
  return prisma.patch.findMany({
    where: { submitterId: userId },
    include: {
      bug: { select: { id: true, title: true } },
      _count: { select: { verifications: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
