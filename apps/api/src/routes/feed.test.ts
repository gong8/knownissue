import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

// Mock prisma
vi.mock("@knownissue/db", () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}));

import { feed } from "./feed";
import { prisma } from "@knownissue/db";

function createApp() {
  const app = new Hono<AppEnv>();
  app.route("/", feed);
  return app;
}

const mockFeedItems = [
  {
    id: "issue-1",
    type: "issue",
    summary: "lodash prototype pollution",
    library: "lodash",
    version: "4.17.20",
    severity: "high",
    ecosystem: "npm",
    status: "open",
    created_at: new Date("2025-01-15"),
    actor: "user-1a",
    actor_avatar: null,
    issue_id: "issue-1",
    issue_title: "lodash prototype pollution",
  },
  {
    id: "patch-1",
    type: "patch",
    summary: "Upgrade to 4.17.21",
    library: "lodash",
    version: "4.17.20",
    severity: "high",
    ecosystem: "npm",
    status: "open",
    created_at: new Date("2025-01-16"),
    actor: "user-2b",
    actor_avatar: "https://avatar.example.com/2",
    issue_id: "issue-1",
    issue_title: "lodash prototype pollution",
  },
];

describe("GET /feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns feed items with default pagination", async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([{ total: BigInt(2) }])  // count query
      .mockResolvedValueOnce(mockFeedItems);            // data query

    const app = createApp();
    const res = await app.request("/feed");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it("maps feed items to correct response shape", async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([{ total: BigInt(1) }])
      .mockResolvedValueOnce([mockFeedItems[0]]);

    const app = createApp();
    const res = await app.request("/feed");

    const body = await res.json();
    const item = body.items[0];
    expect(item.id).toBe("issue-1");
    expect(item.type).toBe("issue");
    expect(item.summary).toBe("lodash prototype pollution");
    expect(item.library).toBe("lodash");
    expect(item.version).toBe("4.17.20");
    expect(item.severity).toBe("high");
    expect(item.ecosystem).toBe("npm");
    expect(item.status).toBe("open");
    expect(item.issueId).toBe("issue-1");
    expect(item.issueTitle).toBe("lodash prototype pollution");
    expect(item.actor).toBe("user-1a");
    expect(item.actor_avatar).toBeNull();
  });

  it("passes pagination params", async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      .mockResolvedValueOnce([]);

    const app = createApp();
    const res = await app.request("/feed?page=3&limit=10");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(3);
    expect(body.limit).toBe(10);
  });

  it("caps limit at 50", async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      .mockResolvedValueOnce([]);

    const app = createApp();
    const res = await app.request("/feed?limit=100");

    const body = await res.json();
    expect(body.limit).toBe(50);
  });

  it("enforces minimum limit of 1", async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      .mockResolvedValueOnce([]);

    const app = createApp();
    const res = await app.request("/feed?limit=0");

    const body = await res.json();
    expect(body.limit).toBe(1);
  });

  it("returns 400 for invalid pagination parameters", async () => {
    const app = createApp();
    const res = await app.request("/feed?page=abc");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid pagination");
  });

  it("returns 400 for invalid limit parameter", async () => {
    const app = createApp();
    const res = await app.request("/feed?limit=xyz");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid pagination");
  });

  describe("type filter", () => {
    it("filters by single type", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?type=issue");

      expect(res.status).toBe(200);
      // Verify that the raw query was called (the SQL should only contain issue UNION part)
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it("filters by multiple comma-separated types", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?type=issue,patch");

      expect(res.status).toBe(200);
    });

    it("returns 400 for invalid type filter", async () => {
      const app = createApp();
      const res = await app.request("/feed?type=invalid");

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid type filter");
    });

    it("returns 400 when all types in comma list are invalid", async () => {
      const app = createApp();
      const res = await app.request("/feed?type=foo,bar");

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid type filter");
    });

    it("filters out invalid types from mixed list", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?type=issue,invalid");

      // Should succeed because "issue" is valid
      expect(res.status).toBe(200);
    });
  });

  describe("severity filter", () => {
    it("filters by severity", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?severity=high");

      expect(res.status).toBe(200);
    });

    it("filters by multiple severities", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?severity=high,critical");

      expect(res.status).toBe(200);
    });

    it("returns 400 for invalid severity filter", async () => {
      const app = createApp();
      const res = await app.request("/feed?severity=extreme");

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid severity filter");
    });
  });

  describe("ecosystem filter", () => {
    it("filters by ecosystem", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?ecosystem=npm");

      expect(res.status).toBe(200);
    });

    it("filters by multiple ecosystems", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?ecosystem=npm,pip");

      expect(res.status).toBe(200);
    });
  });

  describe("range filter", () => {
    it("accepts today range", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?range=today");

      expect(res.status).toBe(200);
    });

    it("accepts week range", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?range=week");

      expect(res.status).toBe(200);
    });

    it("accepts month range", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?range=month");

      expect(res.status).toBe(200);
    });

    it("accepts all range", async () => {
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request("/feed?range=all");

      expect(res.status).toBe(200);
    });

    it("returns 400 for invalid range", async () => {
      const app = createApp();
      const res = await app.request("/feed?range=year");

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid range");
    });
  });

  it("does not require authentication", async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      .mockResolvedValueOnce([]);

    // No user injected, no auth middleware needed
    const app = createApp();
    const res = await app.request("/feed");

    expect(res.status).toBe(200);
  });

  it("returns 500 when database query fails", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockRejectedValue(
      new Error("Database connection error")
    );

    const app = createApp();
    const res = await app.request("/feed");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch feed");
  });

  it("handles empty count result", async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      .mockResolvedValueOnce([]);

    const app = createApp();
    const res = await app.request("/feed");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(0);
    expect(body.total).toBe(0);
  });
});
