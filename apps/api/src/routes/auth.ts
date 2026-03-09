import { Hono } from "hono";
import { prisma } from "@knownissue/db";

const auth = new Hono();

auth.get("/health", async (c) => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return c.json({ status: "ok", db: "connected" });
  } catch {
    return c.json({ status: "degraded", db: "disconnected" }, 503);
  }
});

// GET /stats — public aggregate counts (no auth required)
auth.get("/stats", async (c) => {
  const [
    issues,
    patches,
    users,
    openCriticals,
    patchesWithPositiveScore,
    fixesReusedResult,
    issuesResolved,
    verifiedThisWeek,
  ] = await Promise.all([
    prisma.issue.count(),
    prisma.patch.count(),
    prisma.user.count(),
    prisma.issue.count({
      where: { severity: "critical", status: "open" },
    }),
    prisma.patch.count({
      where: { score: { gt: 0 } },
    }),
    prisma.$queryRawUnsafe<[{ total: bigint }]>(
      `SELECT COALESCE(SUM("accessCount"), 0) AS total FROM "Issue"`,
    ),
    prisma.issue.count({
      where: { status: { in: ["patched", "closed"] } },
    }),
    prisma.verification.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  const approvalRate =
    patches > 0
      ? Math.round((patchesWithPositiveScore / patches) * 100)
      : 0;

  const fixesReused = Number(fixesReusedResult[0].total);

  return c.json({
    issues,
    patches,
    users,
    openCriticals,
    approvalRate,
    fixesReused,
    issuesResolved,
    verifiedThisWeek,
  });
});

// GET /stats/ecosystem — breakdown by ecosystem (no auth required)
auth.get("/stats/ecosystem", async (c) => {
  const ecosystems = await prisma.issue.groupBy({
    by: ["ecosystem"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  const results = await Promise.all(
    ecosystems.map(async (eco) => {
      const [patchCount, resolvedCount, topLibraries] = await Promise.all([
        prisma.patch.count({
          where: { issue: { ecosystem: eco.ecosystem } },
        }),
        prisma.issue.count({
          where: {
            ecosystem: eco.ecosystem,
            status: { in: ["patched", "closed"] },
          },
        }),
        prisma.issue.groupBy({
          by: ["library"],
          where: { ecosystem: eco.ecosystem },
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
          take: 5,
        }),
      ]);

      return {
        ecosystem: eco.ecosystem,
        issueCount: eco._count.id,
        patchCount,
        resolutionRate:
          eco._count.id > 0
            ? Math.round((resolvedCount / eco._count.id) * 100)
            : 0,
        topLibraries: topLibraries.map((lib) => ({
          library: lib.library,
          issueCount: lib._count.id,
        })),
      };
    }),
  );

  return c.json(results);
});

export { auth };
