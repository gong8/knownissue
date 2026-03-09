import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock prisma
vi.mock("@knownissue/db", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    issue: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    patch: {
      count: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
    verification: {
      count: vi.fn(),
    },
  },
}));

import { auth } from "./auth";
import { prisma } from "@knownissue/db";

function createApp() {
  const app = new Hono();
  app.route("/", auth);
  return app;
}

describe("GET /health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok when database is connected", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ "?column?": 1 }]);

    const app = createApp();
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("connected");
  });

  it("returns degraded when database is disconnected", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockRejectedValue(
      new Error("Connection refused")
    );

    const app = createApp();
    const res = await app.request("/health");

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("disconnected");
  });

  it("does not require authentication", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ "?column?": 1 }]);

    const app = createApp();
    const res = await app.request("/health");

    expect(res.status).toBe(200);
  });
});

describe("GET /stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns aggregate stats", async () => {
    vi.mocked(prisma.issue.count)
      .mockResolvedValueOnce(100)  // total issues
      .mockResolvedValueOnce(5)    // open criticals
      .mockResolvedValueOnce(30);  // issues resolved
    vi.mocked(prisma.patch.count).mockResolvedValue(50);
    vi.mocked(prisma.user.count).mockResolvedValue(25);
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ total: BigInt(200) }]);
    vi.mocked(prisma.verification.count).mockResolvedValue(15);

    const app = createApp();
    const res = await app.request("/stats");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issues).toBe(100);
    expect(body.patches).toBe(50);
    expect(body.users).toBe(25);
    expect(body.openCriticals).toBe(5);
    expect(body.fixesReused).toBe(200);
    expect(body.issuesResolved).toBe(30);
    expect(body.verifiedThisWeek).toBe(15);
  });

  it("does not require authentication", async () => {
    vi.mocked(prisma.issue.count).mockResolvedValue(0);
    vi.mocked(prisma.patch.count).mockResolvedValue(0);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ total: BigInt(0) }]);
    vi.mocked(prisma.verification.count).mockResolvedValue(0);

    const app = createApp();
    const res = await app.request("/stats");

    expect(res.status).toBe(200);
  });

  it("queries open criticals with correct filter", async () => {
    vi.mocked(prisma.issue.count).mockResolvedValue(0);
    vi.mocked(prisma.patch.count).mockResolvedValue(0);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ total: BigInt(0) }]);
    vi.mocked(prisma.verification.count).mockResolvedValue(0);

    const app = createApp();
    await app.request("/stats");

    // Second call to issue.count should be for open criticals
    expect(prisma.issue.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { severity: "critical", status: "open" },
      })
    );
  });

  it("queries resolved issues with patched/closed filter", async () => {
    vi.mocked(prisma.issue.count).mockResolvedValue(0);
    vi.mocked(prisma.patch.count).mockResolvedValue(0);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ total: BigInt(0) }]);
    vi.mocked(prisma.verification.count).mockResolvedValue(0);

    const app = createApp();
    await app.request("/stats");

    // Third call to issue.count should be for resolved issues
    expect(prisma.issue.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["patched", "closed"] } },
      })
    );
  });

  it("queries verifications with week-old date filter", async () => {
    vi.mocked(prisma.issue.count).mockResolvedValue(0);
    vi.mocked(prisma.patch.count).mockResolvedValue(0);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ total: BigInt(0) }]);
    vi.mocked(prisma.verification.count).mockResolvedValue(0);

    const app = createApp();
    await app.request("/stats");

    expect(prisma.verification.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: expect.any(Date),
          },
        },
      })
    );
  });
});

describe("GET /stats/ecosystem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ecosystem breakdown", async () => {
    vi.mocked(prisma.issue.groupBy).mockResolvedValueOnce([
      { ecosystem: "npm", _count: { id: 50 } },
      { ecosystem: "pip", _count: { id: 20 } },
    ] as never);

    // For each ecosystem: patchCount, resolvedCount, topLibraries
    vi.mocked(prisma.patch.count)
      .mockResolvedValueOnce(30)   // npm patches
      .mockResolvedValueOnce(10);  // pip patches

    vi.mocked(prisma.issue.count)
      .mockResolvedValueOnce(15)   // npm resolved
      .mockResolvedValueOnce(5);   // pip resolved

    vi.mocked(prisma.issue.groupBy)
      .mockResolvedValueOnce([
        { library: "lodash", _count: { id: 10 } },
        { library: "react", _count: { id: 8 } },
      ] as never)
      .mockResolvedValueOnce([
        { library: "requests", _count: { id: 5 } },
      ] as never);

    const app = createApp();
    const res = await app.request("/stats/ecosystem");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);

    expect(body[0].ecosystem).toBe("npm");
    expect(body[0].issueCount).toBe(50);
    expect(body[0].patchCount).toBe(30);
    expect(body[0].resolutionRate).toBe(30); // Math.round(15/50 * 100)
    expect(body[0].topLibraries).toHaveLength(2);
    expect(body[0].topLibraries[0].library).toBe("lodash");

    expect(body[1].ecosystem).toBe("pip");
    expect(body[1].issueCount).toBe(20);
    expect(body[1].patchCount).toBe(10);
    expect(body[1].resolutionRate).toBe(25); // Math.round(5/20 * 100)
    expect(body[1].topLibraries).toHaveLength(1);
  });

  it("returns empty array when no ecosystems exist", async () => {
    vi.mocked(prisma.issue.groupBy).mockResolvedValue([] as never);

    const app = createApp();
    const res = await app.request("/stats/ecosystem");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("does not require authentication", async () => {
    vi.mocked(prisma.issue.groupBy).mockResolvedValue([] as never);

    const app = createApp();
    const res = await app.request("/stats/ecosystem");

    expect(res.status).toBe(200);
  });

  it("computes resolution rate as 0 when issue count is 0", async () => {
    vi.mocked(prisma.issue.groupBy).mockResolvedValueOnce([
      { ecosystem: "npm", _count: { id: 0 } },
    ] as never);

    vi.mocked(prisma.patch.count).mockResolvedValue(0);
    vi.mocked(prisma.issue.count).mockResolvedValue(0);
    vi.mocked(prisma.issue.groupBy).mockResolvedValue([] as never);

    const app = createApp();
    const res = await app.request("/stats/ecosystem");

    const body = await res.json();
    expect(body[0].resolutionRate).toBe(0);
  });
});
