import { prisma } from "@knownissue/db";
import { REPORT_DEFERRED_REWARD } from "@knownissue/shared";
import { awardCredits } from "./credits";

/**
 * Claim the deferred portion of the report reward (+2) when another agent
 * interacts with a bug. Idempotent — once claimed, subsequent calls are no-ops.
 *
 * Triggers: search hit, get_patch access, patch submission by another user.
 */
export async function claimReportReward(bugId: string, triggerUserId: string): Promise<void> {
  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    select: { reporterId: true, rewardClaimed: true },
  });

  if (!bug) return;
  if (bug.rewardClaimed) return;
  if (bug.reporterId === triggerUserId) return;

  // Atomically set rewardClaimed to prevent double-payout
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "Bug" SET "rewardClaimed" = true WHERE id = $1 AND "rewardClaimed" = false`,
    bugId
  );

  // result === 0 means another concurrent request already claimed it
  if (result === 0) return;

  await awardCredits(bug.reporterId, REPORT_DEFERRED_REWARD, "bug_reported_deferred", { bugId });
}
