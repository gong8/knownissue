import { prisma } from "@knownissue/db";
import { REPORT_DEFERRED_REWARD } from "@knownissue/shared";
import { awardCredits } from "./credits";
import { triggerFirstImpactEmail } from "../email/triggers";

/**
 * Claim the deferred portion of the report reward (+2) when another agent
 * interacts with an issue. Idempotent — once claimed, subsequent calls are no-ops.
 *
 * Triggers: search hit, patchId lookup access, patch submission by another user.
 */
export async function claimReportReward(issueId: string, triggerUserId: string): Promise<void> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { reporterId: true, rewardClaimed: true },
  });

  if (!issue) return;
  if (issue.rewardClaimed) return;
  if (issue.reporterId === triggerUserId) return;

  // Atomically set rewardClaimed to prevent double-payout
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "Bug" SET "rewardClaimed" = true WHERE id = $1 AND "rewardClaimed" = false`,
    issueId
  );

  // result === 0 means another concurrent request already claimed it
  if (result === 0) return;

  await awardCredits(issue.reporterId, REPORT_DEFERRED_REWARD, "issue_reported_deferred", { issueId });

  // Fire-and-forget first impact email
  triggerFirstImpactEmail(issueId).catch(() => {});
}
