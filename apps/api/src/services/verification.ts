import { prisma } from "@knownissue/db";
import type { VerificationOutcome, IssueAccuracy } from "@knownissue/shared";
import { VERIFY_REWARD, PATCH_VERIFIED_FIXED_REWARD, PATCH_VERIFIED_NOT_FIXED_PENALTY, DAILY_VERIFICATION_CAP } from "@knownissue/shared";
import { awardCredits, penalizeCredits } from "./credits";
import { logAudit } from "./audit";
import { computeDerivedStatus } from "./issue";

export async function verify(
  patchId: string,
  outcome: VerificationOutcome,
  note: string | null,
  errorBefore: string | null | undefined,
  errorAfter: string | null | undefined,
  testedVersion: string | null | undefined,
  issueAccuracy: IssueAccuracy | undefined,
  verifierId: string
) {
  const patch = await prisma.patch.findUnique({
    where: { id: patchId },
    include: { submitter: true },
  });

  if (!patch) {
    throw new Error("Patch not found");
  }

  if (patch.submitterId === verifierId) {
    throw new Error("Cannot verify your own patch");
  }

  // Check unique constraint
  const existing = await prisma.verification.findUnique({
    where: { patchId_verifierId: { patchId, verifierId } },
  });

  if (existing) {
    throw new Error("You have already verified this patch");
  }

  // Daily verification cap
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayCount = await prisma.verification.count({
    where: { verifierId, createdAt: { gte: oneDayAgo } },
  });

  if (todayCount >= DAILY_VERIFICATION_CAP) {
    throw new Error("Daily verification limit reached (20/day). Try again tomorrow.");
  }

  const verification = await prisma.verification.create({
    data: {
      outcome,
      note,
      errorBefore: errorBefore ?? null,
      errorAfter: errorAfter ?? null,
      testedVersion: testedVersion ?? null,
      issueAccuracy: issueAccuracy ?? "accurate",
      patchId,
      verifierId,
    },
    include: { verifier: true },
  });

  // Award verifier
  await awardCredits(verifierId, VERIFY_REWARD, "verification_given", { patchId });

  // Adjust patch author's credits
  let authorCreditDelta = 0;
  if (outcome === "fixed") {
    await awardCredits(patch.submitterId, PATCH_VERIFIED_FIXED_REWARD, "patch_verified_fixed", { patchId });
    authorCreditDelta = PATCH_VERIFIED_FIXED_REWARD;
  } else if (outcome === "not_fixed") {
    await penalizeCredits(patch.submitterId, PATCH_VERIFIED_NOT_FIXED_PENALTY, "patch_verified_not_fixed", { patchId });
    authorCreditDelta = -PATCH_VERIFIED_NOT_FIXED_PENALTY;
  }

  await logAudit({
    action: "create",
    entityType: "verification",
    entityId: verification.id,
    actorId: verifierId,
    metadata: { patchId, outcome },
  });

  // Recompute derived status
  await computeDerivedStatus(patch.issueId);

  return {
    ...verification,
    authorCreditDelta,
    verifierCreditDelta: VERIFY_REWARD,
    _next_actions: [
      "Verification recorded — thank you for keeping the knowledge trustworthy",
    ],
  };
}
