import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import type { User } from "@knownissue/shared";

// Mock auth middleware
vi.mock("../middleware/auth", () => ({
  optionalAuthMiddleware: vi.fn().mockImplementation(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// Mock service layer
vi.mock("../services/issue", () => ({
  searchIssues: vi.fn(),
  listIssues: vi.fn(),
  getIssueById: vi.fn(),
}));

vi.mock("../services/credits", () => ({
  deductCredits: vi.fn(),
}));

import { issues } from "./issues";
import * as issueService from "../services/issue";
import { deductCredits } from "../services/credits";

const mockUser: User = {
  id: "user-1",
  clerkId: "clerk-1",
  avatarUrl: null,
  credits: 10,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

/**
 * Create an app with the issues routes mounted.
 * Optionally inject a user into context to simulate auth.
 */
function createApp(user?: User) {
  const app = new Hono<AppEnv>();

  if (user) {
    app.use("*", async (c, next) => {
      c.set("user", user);
      return next();
    });
  }

  app.route("/", issues);
  return app;
}

describe("GET /issues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list mode (no query)", () => {
    it("calls listIssues with default pagination", async () => {
      vi.mocked(issueService.listIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      const app = createApp();
      const res = await app.request("/issues");

      expect(res.status).toBe(200);
      expect(issueService.listIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
          offset: 0,
        })
      );
    });

    it("passes library, version, ecosystem filters", async () => {
      vi.mocked(issueService.listIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      const app = createApp();
      const res = await app.request(
        "/issues?library=react&version=18.2.0&ecosystem=npm"
      );

      expect(res.status).toBe(200);
      expect(issueService.listIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          library: "react",
          version: "18.2.0",
          ecosystem: "npm",
        })
      );
    });

    it("splits comma-separated status values", async () => {
      vi.mocked(issueService.listIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      const app = createApp();
      await app.request("/issues?status=open,confirmed");

      expect(issueService.listIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ["open", "confirmed"],
        })
      );
    });

    it("splits comma-separated severity values", async () => {
      vi.mocked(issueService.listIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      const app = createApp();
      await app.request("/issues?severity=high,critical");

      expect(issueService.listIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: ["high", "critical"],
        })
      );
    });

    it("passes category and sort params", async () => {
      vi.mocked(issueService.listIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      const app = createApp();
      await app.request("/issues?category=crash&sort=recent");

      expect(issueService.listIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "crash",
          sort: "recent",
        })
      );
    });

    it("does not require auth for list mode", async () => {
      vi.mocked(issueService.listIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      // No user injected
      const app = createApp();
      const res = await app.request("/issues");

      expect(res.status).toBe(200);
      expect(deductCredits).not.toHaveBeenCalled();
    });
  });

  describe("search mode (with q param)", () => {
    it("requires auth and deducts credits", async () => {
      vi.mocked(issueService.searchIssues).mockResolvedValue({
        issues: [{ id: "issue-1" }],
        total: 1,
      });

      const app = createApp(mockUser);
      const res = await app.request("/issues?q=lodash+crash");

      expect(res.status).toBe(200);
      expect(deductCredits).toHaveBeenCalledWith(
        "user-1",
        1,
        "search"
      );
      expect(issueService.searchIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "lodash crash",
        })
      );
    });

    it("returns 401 when unauthenticated", async () => {
      // No user in context
      const app = createApp();
      const res = await app.request("/issues?q=crash");

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Authentication required");
    });

    it("returns 403 when deductCredits throws", async () => {
      vi.mocked(deductCredits).mockRejectedValue(
        new Error("Insufficient credits")
      );

      const app = createApp(mockUser);
      const res = await app.request("/issues?q=test");

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Insufficient credits");
    });

    it("passes search filters", async () => {
      vi.mocked(deductCredits).mockResolvedValue(undefined);
      vi.mocked(issueService.searchIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      const app = createApp(mockUser);
      await app.request(
        "/issues?q=crash&library=react&version=18.2.0&errorCode=ERR_001&limit=5&page=2"
      );

      expect(issueService.searchIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "crash",
          library: "react",
          version: "18.2.0",
          errorCode: "ERR_001",
          limit: 5,
          offset: 5, // (page 2 - 1) * limit 5
        })
      );
    });
  });

  describe("pagination", () => {
    it("returns 400 for invalid page param", async () => {
      const app = createApp();
      const res = await app.request("/issues?page=abc");

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid pagination");
    });

    it("returns 400 for invalid limit param", async () => {
      const app = createApp();
      const res = await app.request("/issues?limit=xyz");

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid pagination");
    });

    it("caps limit at 50", async () => {
      vi.mocked(issueService.listIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      const app = createApp();
      await app.request("/issues?limit=100");

      expect(issueService.listIssues).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it("enforces minimum limit of 1", async () => {
      vi.mocked(issueService.listIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      const app = createApp();
      await app.request("/issues?limit=0");

      expect(issueService.listIssues).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 1 })
      );
    });

    it("enforces minimum page of 1", async () => {
      vi.mocked(issueService.listIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      const app = createApp();
      await app.request("/issues?page=0");

      expect(issueService.listIssues).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 0 }) // (max(1,0) - 1) * 20 = 0
      );
    });

    it("computes correct offset for page 3 limit 10", async () => {
      vi.mocked(issueService.listIssues).mockResolvedValue({
        issues: [],
        total: 0,
      });

      const app = createApp();
      await app.request("/issues?page=3&limit=10");

      expect(issueService.listIssues).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });
  });
});

describe("GET /issues/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns issue when found", async () => {
    const mockIssue = {
      id: "issue-1",
      title: "Test Issue",
      status: "open",
      severity: "medium",
    };
    vi.mocked(issueService.getIssueById).mockResolvedValue(mockIssue);

    const app = createApp();
    const res = await app.request("/issues/issue-1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("issue-1");
    expect(body.title).toBe("Test Issue");
  });

  it("returns 404 when issue not found", async () => {
    vi.mocked(issueService.getIssueById).mockResolvedValue(null);

    const app = createApp();
    const res = await app.request("/issues/nonexistent");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("passes the id param to getIssueById", async () => {
    vi.mocked(issueService.getIssueById).mockResolvedValue(null);

    const app = createApp();
    await app.request("/issues/abc-123-def");

    expect(issueService.getIssueById).toHaveBeenCalledWith("abc-123-def");
  });
});
