import { prisma, Prisma } from "@knownissue/db";
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

  let verification;
  try {
    verification = await prisma.verification.create({
      data: {
        outcome,
        note,
        errorBefore: errorBefore ?? null,
        errorAfter: errorAfter ?? null,
        testedVersion: testedVersion ?? null,
        issueAccuracy: issueAccuracy ?? null,
        patchId,
        verifierId,
      },
      include: { verifier: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("You have already verified this patch");
    }
    throw error;
  }

  // ── Post-create side effects ──────────────────────────────────────────
  // Verification is committed. From here, failures are logged but don't
  // kill the response — the agent's verification went through.
  const _warnings: string[] = [];

  // Award verifier credits
  let newBalance: number | undefined;
  try {
    newBalance = await awardCredits(verifierId, VERIFY_REWARD, "verification_given", { patchId });
  } catch (err) {
    console.error("Failed to award verifier credits:", err);
    _warnings.push("Verification recorded but credit award failed — credits will be reconciled");
  }

  // Adjust patch author's credits
  let authorCreditDelta = 0;
  try {
    if (outcome === "fixed") {
      await awardCredits(patch.submitterId, PATCH_VERIFIED_FIXED_REWARD, "patch_verified_fixed", { patchId });
      authorCreditDelta = PATCH_VERIFIED_FIXED_REWARD;
    } else if (outcome === "not_fixed") {
      const { actualDeduction } = await penalizeCredits(patch.submitterId, PATCH_VERIFIED_NOT_FIXED_PENALTY, "patch_verified_not_fixed", { patchId });
      authorCreditDelta = -actualDeduction;
    }
  } catch (err) {
    console.error("Failed to adjust author credits:", err);
    _warnings.push("Author credit adjustment failed — will be reconciled");
  }

  // Audit + status recompute — best-effort
  logAudit({
    action: "create",
    entityType: "verification",
    entityId: verification.id,
    actorId: verifierId,
    metadata: { patchId, outcome },
  }).catch((err) => console.error("Failed to log verification audit:", err));

  computeDerivedStatus(patch.issueId).catch((err) =>
    console.error("Failed to recompute derived status:", err)
  );

  const nextActions: string[] = [];
  switch (outcome) {
    case "fixed":
      nextActions.push(
        "Verification recorded — this patch is working as intended",
        "Consider verifying other unverified patches to earn more credits"
      );
      break;
    case "not_fixed":
      nextActions.push(
        "Verification recorded — this patch did not resolve the issue",
        "Search for alternative patches or submit your own fix to earn +5 credits"
      );
      break;
    case "partial":
      nextActions.push(
        "Verification recorded — this patch partially addresses the issue",
        "Consider submitting an improved patch to earn +5 credits"
      );
      break;
  }

  return {
    ...verification,
    authorCreditDelta,
    verifierCreditDelta: VERIFY_REWARD,
    creditsBalance: newBalance,
    ...(_warnings.length > 0 && { _warnings }),
    _next_actions: nextActions,
  };
}
