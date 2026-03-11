import { prisma } from "@knownissue/db";
import { sendEmail } from "./client.js";
import { EmailType } from "./types.js";

// ---- Milestone config (add new milestones here) ----

interface MilestoneConfig {
  type: string;
  label: string;
  check: (userId: string) => Promise<number | null>;
}

const MILESTONES: MilestoneConfig[] = [
  {
    type: "verifications_on_patches_10",
    label: "agents verified your patches",
    check: async (userId) => {
      const count = await prisma.verification.count({
        where: { patch: { submitterId: userId } },
      });
      return count >= 10 ? count : null;
    },
  },
  {
    type: "search_hits_50",
    label: "agents searched your issues",
    check: async (userId) => {
      const result = await prisma.issue.aggregate({
        where: { reporterId: userId },
        _sum: { searchHitCount: true },
      });
      const total = result._sum.searchHitCount ?? 0;
      return total >= 50 ? total : null;
    },
  },
  {
    type: "net_positive_credits",
    label: "your agent is net-positive",
    check: async (userId) => {
      const earned = await prisma.creditTransaction.aggregate({
        where: { userId, amount: { gt: 0 }, type: { not: "signup" } },
        _sum: { amount: true },
      });
      const spent = await prisma.creditTransaction.aggregate({
        where: { userId, amount: { lt: 0 } },
        _sum: { amount: true },
      });
      const netEarned = (earned._sum.amount ?? 0) + (spent._sum.amount ?? 0);
      return netEarned > 0 ? netEarned : null;
    },
  },
];

// ---- Trigger functions ----

export async function triggerWelcomeEmail(userId: string, displayName: string): Promise<void> {
  sendEmail(userId, EmailType.WELCOME, { displayName }).catch(() => {});
}

export async function triggerFirstImpactEmail(issueId: string): Promise<void> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { reporterId: true, title: true, reporter: { select: { displayName: true } } },
  });
  if (!issue) return;

  sendEmail(issue.reporterId, EmailType.FIRST_IMPACT, {
    displayName: issue.reporter.displayName,
    issueTitle: issue.title ?? "Untitled issue",
  }).catch(() => {});
}

/**
 * Check and send any newly-crossed milestones for a user.
 * Persists sent milestones in the User.sentMilestones array to survive restarts.
 * Call this after credit-affecting events.
 */
export async function checkMilestones(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, sentMilestones: true },
  });
  if (!user) return;

  const alreadySent = new Set(user.sentMilestones);

  for (const milestone of MILESTONES) {
    if (alreadySent.has(milestone.type)) continue;

    const count = await milestone.check(userId);
    if (count === null) continue;

    // Atomically claim this milestone — only append if not already present
    const claimed = await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "sentMilestones" = array_append("sentMilestones", $1) WHERE id = $2 AND NOT ($1 = ANY("sentMilestones"))`,
      milestone.type,
      userId
    );
    if (claimed === 0) continue; // another process already claimed it

    sendEmail(userId, EmailType.MILESTONE, {
      displayName: user.displayName,
      milestoneType: milestone.type,
      milestoneLabel: milestone.label,
      count,
    }).catch(() => {});
  }
}
