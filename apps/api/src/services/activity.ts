import { prisma } from "@knownissue/db";

const DEFAULT_LIMIT = 10;

export async function getMyActivity(
  userId: string,
  filters: { type?: string; outcome?: string; limit?: number }
) {
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, 50);
  const showIssues = !filters.type || filters.type === "issues";
  const showPatches = !filters.type || filters.type === "patches";
  const showVerifications = !filters.type || filters.type === "verifications";

  const [
    summary,
    recentIssues,
    recentPatches,
    recentVerifications,
    actionablePatches,
    actionableIssues,
  ] = await Promise.all([
    getSummary(userId),
    showIssues
      ? prisma.issue.findMany({
          where: { reporterId: userId },
          select: {
            id: true,
            title: true,
            library: true,
            version: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
    showPatches ? getRecentPatches(userId, limit, filters.outcome) : Promise.resolve([]),
    showVerifications
      ? prisma.verification.findMany({
          where: { verifierId: userId },
          select: {
            id: true,
            patchId: true,
            outcome: true,
            createdAt: true,
            patch: {
              select: {
                issueId: true,
                issue: { select: { title: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
    getActionablePatches(userId),
    getActionableIssues(userId),
  ]);

  const actionableCount = actionablePatches.length + actionableIssues.length;

  return {
    summary,
    recent: {
      ...(showIssues && { issues: recentIssues }),
      ...(showPatches && {
        patches: recentPatches.map((p) => ({
          id: p.id,
          issueId: p.issueId,
          issueTitle: p.issue.title,
          explanation: p.explanation,
          verifications: p._verificationCounts,
          createdAt: p.createdAt,
        })),
      }),
      ...(showVerifications && {
        verifications: recentVerifications.map((v) => ({
          id: v.id,
          patchId: v.patchId,
          issueId: v.patch.issueId,
          issueTitle: v.patch.issue.title,
          outcome: v.outcome,
          createdAt: v.createdAt,
        })),
      }),
    },
    actionable: [
      ...actionablePatches.map((p) => ({
        type: "patch_needs_revision" as const,
        patchId: p.id,
        issueTitle: p.issue.title,
        notFixedCount: p._notFixedCount,
        latestNote: p._latestNote,
        suggested_action: `Call search with patchId "${p.id}" to review feedback, then call patch to update your fix`,
      })),
      ...actionableIssues.map((b) => ({
        type: "issue_status_changed" as const,
        issueId: b.id,
        title: b.title,
        newStatus: b.status,
        suggested_action: `Search for issue "${b.id}" to see the latest patches and verifications`,
      })),
    ],
    _next_actions: actionableCount > 0
      ? [`You have ${actionableCount} item${actionableCount > 1 ? "s" : ""} needing attention — check the actionable items above`]
      : ["No items need attention right now — search for issues to verify or report new ones"],
  };
}

async function getSummary(userId: string) {
  const [issueCount, patchCount, verificationCount, user, earned, spent] =
    await Promise.all([
      prisma.issue.count({ where: { reporterId: userId } }),
      prisma.patch.count({ where: { submitterId: userId } }),
      prisma.verification.count({ where: { verifierId: userId } }),
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { credits: true },
      }),
      prisma.creditTransaction.aggregate({
        where: { userId, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      prisma.creditTransaction.aggregate({
        where: { userId, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
    ]);

  return {
    issuesReported: issueCount,
    patchesSubmitted: patchCount,
    verificationsGiven: verificationCount,
    creditsEarned: earned._sum.amount ?? 0,
    creditsSpent: Math.abs(spent._sum.amount ?? 0),
    currentBalance: user.credits,
  };
}

async function getRecentPatches(
  userId: string,
  limit: number,
  outcomeFilter?: string
) {
  const patches = await prisma.patch.findMany({
    where: {
      submitterId: userId,
      ...(outcomeFilter && {
        verifications: {
          some: { outcome: outcomeFilter as "fixed" | "not_fixed" | "partial" },
        },
      }),
    },
    select: {
      id: true,
      issueId: true,
      explanation: true,
      createdAt: true,
      issue: { select: { title: true } },
      verifications: {
        select: { outcome: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return patches.map((p) => {
    const counts = { fixed: 0, not_fixed: 0, partial: 0 };
    for (const v of p.verifications) {
      counts[v.outcome]++;
    }
    return { ...p, _verificationCounts: counts };
  });
}

async function getActionablePatches(userId: string) {
  const patches = await prisma.patch.findMany({
    where: {
      submitterId: userId,
      verifications: { some: { outcome: "not_fixed" } },
    },
    select: {
      id: true,
      issue: { select: { title: true } },
      verifications: {
        where: { outcome: "not_fixed" },
        select: { note: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return patches.map((p) => ({
    ...p,
    _notFixedCount: p.verifications.length,
    _latestNote: p.verifications[0]?.note ?? null,
  }));
}

async function getActionableIssues(userId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return prisma.issue.findMany({
    where: {
      reporterId: userId,
      status: { in: ["patched", "closed"] },
      updatedAt: { gte: thirtyDaysAgo },
    },
    select: {
      id: true,
      title: true,
      status: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
}
