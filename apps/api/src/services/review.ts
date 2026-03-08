import { prisma } from "@knownissue/db";
import type { Vote } from "@knownissue/shared";
import { UPVOTE_REWARD, DOWNVOTE_PENALTY } from "@knownissue/shared";

export async function reviewPatch(
  patchId: string,
  vote: Vote,
  comment: string | null,
  reviewerId: string
) {
  // Verify patch exists
  const patch = await prisma.patch.findUnique({
    where: { id: patchId },
    include: { submitter: true },
  });

  if (!patch) {
    throw new Error("Patch not found");
  }

  // Prevent self-review
  if (patch.submitterId === reviewerId) {
    throw new Error("Cannot review your own patch");
  }

  // Check for existing review (unique constraint will also catch this)
  const existing = await prisma.review.findUnique({
    where: {
      patchId_reviewerId: {
        patchId,
        reviewerId,
      },
    },
  });

  if (existing) {
    throw new Error("You have already reviewed this patch");
  }

  const scoreChange = vote === "up" ? 1 : -1;

  return prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        vote,
        comment,
        patchId,
        reviewerId,
      },
      include: { reviewer: true },
    });

    await tx.patch.update({
      where: { id: patchId },
      data: { score: { increment: scoreChange } },
    });

    // Adjust patch author's karma
    if (vote === "up") {
      await tx.user.update({
        where: { id: patch.submitterId },
        data: { karma: { increment: UPVOTE_REWARD } },
      });
    } else {
      // For downvotes, don't let karma go below 0
      await tx.$executeRawUnsafe(
        `UPDATE "User" SET karma = GREATEST(karma - $1, 0), "updatedAt" = NOW() WHERE id = $2`,
        DOWNVOTE_PENALTY,
        patch.submitterId
      );
    }

    return review;
  });
}
