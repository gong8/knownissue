import { prisma } from "@knownissue/db";

const DEFAULT_LIMIT = 10;

export async function getMyActivity(
  userId: string,
  filters: { type?: string; outcome?: string; limit?: number }
) {
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, 50);
  const showBugs = !filters.type || filters.type === "bugs";
  const showPatches = !filters.type || filters.type === "patches";
  const showVerifications = !filters.type || filters.type === "verifications";

  const [
    summary,
    recentBugs,
    recentPatches,
    recentVerifications,
    actionablePatches,
    actionableBugs,
  ] = await Promise.all([
    getSummary(userId),
    showBugs
      ? prisma.bug.findMany({
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
                bug: { select: { title: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
    showPatches ? getActionablePatches(userId) : Promise.resolve([]),
    showBugs ? getActionableBugs(userId) : Promise.resolve([]),
  ]);

  return {
    summary,
    recent: {
      ...(showBugs && { bugs: recentBugs }),
      ...(showPatches && {
        patches: recentPatches.map((p) => ({
          id: p.id,
          bugId: p.bugId,
          bugTitle: p.bug.title,
          explanation: p.explanation,
          verifications: p._verificationCounts,
          createdAt: p.createdAt,
        })),
      }),
      ...(showVerifications && {
        verifications: recentVerifications.map((v) => ({
          id: v.id,
          patchId: v.patchId,
          bugTitle: v.patch.bug.title,
          outcome: v.outcome,
          createdAt: v.createdAt,
        })),
      }),
    },
    actionable: [
      ...actionablePatches.map((p) => ({
        type: "patch_needs_revision" as const,
        patchId: p.id,
        bugTitle: p.bug.title,
        notFixedCount: p._notFixedCount,
        latestNote: p._latestNote,
      })),
      ...actionableBugs.map((b) => ({
        type: "bug_status_changed" as const,
        bugId: b.id,
        title: b.title,
        newStatus: b.status,
      })),
    ],
  };
}

async function getSummary(userId: string) {
  const [bugCount, patchCount, verificationCount, user, earned, spent] =
    await Promise.all([
      prisma.bug.count({ where: { reporterId: userId } }),
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
    bugsReported: bugCount,
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
      bugId: true,
      explanation: true,
      createdAt: true,
      bug: { select: { title: true } },
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
      bug: { select: { title: true } },
      verifications: {
        where: { outcome: "not_fixed" },
        select: { note: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return patches.map((p) => ({
    ...p,
    _notFixedCount: p.verifications.length,
    _latestNote: p.verifications[0]?.note ?? null,
  }));
}

async function getActionableBugs(userId: string) {
  return prisma.bug.findMany({
    where: {
      reporterId: userId,
      status: { not: "open" },
    },
    select: {
      id: true,
      title: true,
      status: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}
