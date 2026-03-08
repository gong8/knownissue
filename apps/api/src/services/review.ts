import { prisma } from "@knownissue/db";
import type { Vote, ReviewTargetType } from "@knownissue/shared";
import { UPVOTE_REWARD, DOWNVOTE_PENALTY, REVIEW_REWARD } from "@knownissue/shared";
import { awardCredits, penalizeCredits } from "./credits";
import { logAudit } from "./audit";
import { computeDerivedStatus } from "./bug";

export async function review(
  targetId: string,
  targetType: ReviewTargetType,
  vote: Vote,
  note: string | null,
  version: string | null | undefined,
  reviewerId: string
) {
  if (targetType === "patch") {
    return reviewPatch(targetId, vote, note, version ?? null, reviewerId);
  } else {
    return reviewBug(targetId, vote, note, version ?? null, reviewerId);
  }
}

async function reviewPatch(
  patchId: string,
  vote: Vote,
  note: string | null,
  version: string | null,
  reviewerId: string
) {
  const patch = await prisma.patch.findUnique({
    where: { id: patchId },
    include: { submitter: true },
  });

  if (!patch) {
    throw new Error("Patch not found");
  }

  if (patch.submitterId === reviewerId) {
    throw new Error("Cannot review your own patch");
  }

  // Check unique constraint
  const existing = await prisma.review.findFirst({
    where: {
      targetId: patchId,
      targetType: "patch",
      reviewerId,
    },
  });

  if (existing) {
    throw new Error("You have already reviewed this patch");
  }

  const scoreChange = vote === "up" ? 1 : -1;

  const reviewRecord = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        vote,
        note,
        targetId: patchId,
        targetType: "patch",
        version,
        patchId,
        reviewerId,
      },
      include: { reviewer: true },
    });

    await tx.patch.update({
      where: { id: patchId },
      data: { score: { increment: scoreChange } },
    });

    return created;
  });

  // Award reviewer
  await awardCredits(reviewerId, REVIEW_REWARD, "review_given", { patchId });

  // Adjust patch author's credits
  if (vote === "up") {
    await awardCredits(patch.submitterId, UPVOTE_REWARD, "patch_upvoted", { patchId });
  } else {
    await penalizeCredits(patch.submitterId, DOWNVOTE_PENALTY, "patch_downvoted", { patchId });
  }

  await logAudit({
    action: "create",
    entityType: "review",
    entityId: reviewRecord.id,
    actorId: reviewerId,
    metadata: { patchId, targetType: "patch", vote },
  });

  // Recompute derived status
  await computeDerivedStatus(patch.bugId);

  const creditEffect = vote === "up"
    ? { authorCreditDelta: UPVOTE_REWARD }
    : { authorCreditDelta: -DOWNVOTE_PENALTY };

  return { ...reviewRecord, ...creditEffect, reviewerCreditDelta: REVIEW_REWARD };
}

async function reviewBug(
  bugId: string,
  vote: Vote,
  note: string | null,
  version: string | null,
  reviewerId: string
) {
  const bug = await prisma.bug.findUnique({ where: { id: bugId } });

  if (!bug) {
    throw new Error("Bug not found");
  }

  if (bug.reporterId === reviewerId) {
    throw new Error("Cannot review your own bug report");
  }

  const existing = await prisma.review.findFirst({
    where: {
      targetId: bugId,
      targetType: "bug",
      reviewerId,
    },
  });

  if (existing) {
    throw new Error("You have already reviewed this bug");
  }

  const scoreChange = vote === "up" ? 1 : -1;

  const reviewRecord = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        vote,
        note,
        targetId: bugId,
        targetType: "bug",
        version,
        bugId,
        reviewerId,
      },
      include: { reviewer: true },
    });

    await tx.bug.update({
      where: { id: bugId },
      data: { score: { increment: scoreChange } },
    });

    return created;
  });

  // Award reviewer
  await awardCredits(reviewerId, REVIEW_REWARD, "review_given", { bugId });

  // Adjust bug reporter's credits
  if (vote === "up") {
    await awardCredits(bug.reporterId, UPVOTE_REWARD, "bug_upvoted", { bugId });
  } else {
    await penalizeCredits(bug.reporterId, DOWNVOTE_PENALTY, "bug_downvoted", { bugId });
  }

  await logAudit({
    action: "create",
    entityType: "review",
    entityId: reviewRecord.id,
    actorId: reviewerId,
    metadata: { bugId, targetType: "bug", vote },
  });

  // Recompute derived status
  await computeDerivedStatus(bugId);

  const creditEffect = vote === "up"
    ? { authorCreditDelta: UPVOTE_REWARD }
    : { authorCreditDelta: -DOWNVOTE_PENALTY };

  return { ...reviewRecord, ...creditEffect, reviewerCreditDelta: REVIEW_REWARD };
}
