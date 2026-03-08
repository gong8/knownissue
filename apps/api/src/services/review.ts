import { prisma } from "@knownissue/db";
import type { Vote } from "@knownissue/shared";
import { UPVOTE_REWARD, DOWNVOTE_PENALTY } from "@knownissue/shared";
import { awardKarma, deductKarma } from "./karma";

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

  // Create review and update patch score in a transaction
  const scoreChange = vote === "up" ? 1 : -1;

  const [review] = await prisma.$transaction([
    prisma.review.create({
      data: {
        vote,
        comment,
        patchId,
        reviewerId,
      },
      include: { reviewer: true },
    }),
    prisma.patch.update({
      where: { id: patchId },
      data: { score: { increment: scoreChange } },
    }),
  ]);

  // Adjust patch author's karma (non-critical, outside transaction)
  try {
    if (vote === "up") {
      await awardKarma(patch.submitterId, UPVOTE_REWARD);
    } else {
      await deductKarma(patch.submitterId, DOWNVOTE_PENALTY);
    }
  } catch {
    // Karma adjustment failure shouldn't block the review
    console.warn("Failed to adjust karma for patch author");
  }

  return review;
}
