import { prisma } from "@knownissue/db";
import { PATCH_REWARD } from "@knownissue/shared";
import { awardCredits } from "./credits";

export async function submitPatch(
  bugId: string,
  description: string,
  code: string,
  userId: string
) {
  // Verify bug exists
  const bug = await prisma.bug.findUnique({ where: { id: bugId } });
  if (!bug) {
    throw new Error("Bug not found");
  }

  const patch = await prisma.patch.create({
    data: {
      description,
      code,
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
