import { prisma } from "@knownissue/db";
import { PATCH_REWARD } from "@knownissue/shared";

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

  return prisma.$transaction(async (tx) => {
    const patch = await tx.patch.create({
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

    await tx.user.update({
      where: { id: userId },
      data: { karma: { increment: PATCH_REWARD } },
    });

    return patch;
  });
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
