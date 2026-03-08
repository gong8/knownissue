import { prisma } from "@knownissue/db";
import type { Vote } from "@knownissue/shared";
import { UPVOTE_REWARD, DOWNVOTE_PENALTY } from "@knownissue/shared";
import { awardCredits, penalizeCredits } from "./credits";

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

  const review = await prisma.$transaction(async (tx) => {
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

    return review;
  });

  // Adjust patch author's credits (outside transaction so logging works)
  if (vote === "up") {
    await awardCredits(patch.submitterId, UPVOTE_REWARD, "patch_upvoted", {
      patchId,
    });
  } else {
    await penalizeCredits(patch.submitterId, DOWNVOTE_PENALTY, "patch_downvoted", {
      patchId,
    });
  }

  const creditEffect = vote === "up"
    ? { authorCreditDelta: UPVOTE_REWARD }
    : { authorCreditDelta: -DOWNVOTE_PENALTY };

  return { ...review, ...creditEffect };
}
