import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import type { User } from "@knownissue/shared";

// Mock auth middleware
vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn().mockImplementation(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// Mock service layers
vi.mock("../services/credits", () => ({
  getCredits: vi.fn(),
  getUserTransactions: vi.fn(),
}));

vi.mock("../services/issue", () => ({
  getUserIssues: vi.fn(),
}));

vi.mock("../services/patch", () => ({
  getUserPatches: vi.fn(),
}));

vi.mock("../services/activity", () => ({
  getMyActivity: vi.fn(),
}));

// Mock prisma
vi.mock("@knownissue/db", () => ({
  prisma: {
    issue: { count: vi.fn() },
    patch: { count: vi.fn() },
    verification: { count: vi.fn() },
  },
}));

import { users } from "./users";
import { getCredits, getUserTransactions } from "../services/credits";
import * as issueService from "../services/issue";
import * as patchService from "../services/patch";
import { getMyActivity } from "../services/activity";
import { prisma } from "@knownissue/db";

const mockUser: User = {
  id: "user-1",
  clerkId: "clerk-1",
  avatarUrl: null,
  credits: 10,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

function createApp(user?: User) {
  const app = new Hono<AppEnv>();

  if (user) {
    app.use("*", async (c, next) => {
      c.set("user", user);
      return next();
    });
  }

  app.route("/", users);
  return app;
}

describe("GET /users/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns current user profile with credits", async () => {
    vi.mocked(getCredits).mockResolvedValue(42);

    const app = createApp(mockUser);
    const res = await app.request("/users/me");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("user-1");
    expect(body.clerkId).toBe("clerk-1");
    expect(body.credits).toBe(42);
  });

  it("calls getCredits with user id", async () => {
    vi.mocked(getCredits).mockResolvedValue(10);

    const app = createApp(mockUser);
    await app.request("/users/me");

    expect(getCredits).toHaveBeenCalledWith("user-1");
  });
});

describe("GET /users/me/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns aggregated stats", async () => {
    vi.mocked(getCredits).mockResolvedValue(25);
    vi.mocked(prisma.issue.count)
      .mockResolvedValueOnce(10)  // issuesReported
      .mockResolvedValueOnce(3);  // issuesPatched
    vi.mocked(prisma.patch.count)
      .mockResolvedValueOnce(5)   // patchesSubmitted
      .mockResolvedValueOnce(2);  // patchesVerifiedFixed
    vi.mocked(prisma.verification.count)
      .mockResolvedValueOnce(8)   // verificationsGiven
      .mockResolvedValueOnce(4)   // verificationsFixed
      .mockResolvedValueOnce(2)   // verificationsNotFixed
      .mockResolvedValueOnce(2);  // verificationsPartial

    const app = createApp(mockUser);
    const res = await app.request("/users/me/stats");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credits).toBe(25);
    expect(body.issuesReported).toBe(10);
    expect(body.issuesPatched).toBe(3);
    expect(body.patchesSubmitted).toBe(5);
    expect(body.patchesVerifiedFixed).toBe(2);
    expect(body.verificationsGiven).toBe(8);
    expect(body.verificationsFixed).toBe(4);
    expect(body.verificationsNotFixed).toBe(2);
    expect(body.verificationsPartial).toBe(2);
  });

  it("queries prisma with correct filters for issuesPatched", async () => {
    vi.mocked(getCredits).mockResolvedValue(0);
    vi.mocked(prisma.issue.count).mockResolvedValue(0);
    vi.mocked(prisma.patch.count).mockResolvedValue(0);
    vi.mocked(prisma.verification.count).mockResolvedValue(0);

    const app = createApp(mockUser);
    await app.request("/users/me/stats");

    // Second call to issue.count should filter by patched/closed status
    expect(prisma.issue.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reporterId: "user-1", status: { in: ["patched", "closed"] } },
      })
    );
  });
});

describe("GET /users/me/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns transactions with default pagination", async () => {
    const mockResult = {
      transactions: [
        { id: "tx-1", amount: 5, type: "patch_submitted" },
        { id: "tx-2", amount: -1, type: "search" },
      ],
      total: 2,
    };
    vi.mocked(getUserTransactions).mockResolvedValue(mockResult);

    const app = createApp(mockUser);
    const res = await app.request("/users/me/transactions");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transactions).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(getUserTransactions).toHaveBeenCalledWith("user-1", {
      limit: 20,
      offset: 0,
    });
  });

  it("passes pagination params correctly", async () => {
    vi.mocked(getUserTransactions).mockResolvedValue({
      transactions: [],
      total: 0,
    });

    const app = createApp(mockUser);
    await app.request("/users/me/transactions?page=3&limit=10");

    expect(getUserTransactions).toHaveBeenCalledWith("user-1", {
      limit: 10,
      offset: 20, // (3 - 1) * 10
    });
  });

  it("caps limit at 50", async () => {
    vi.mocked(getUserTransactions).mockResolvedValue({
      transactions: [],
      total: 0,
    });

    const app = createApp(mockUser);
    await app.request("/users/me/transactions?limit=100");

    expect(getUserTransactions).toHaveBeenCalledWith("user-1", {
      limit: 50,
      offset: 0,
    });
  });

  it("enforces minimum limit of 1", async () => {
    vi.mocked(getUserTransactions).mockResolvedValue({
      transactions: [],
      total: 0,
    });

    const app = createApp(mockUser);
    await app.request("/users/me/transactions?limit=0");

    expect(getUserTransactions).toHaveBeenCalledWith("user-1", {
      limit: 1,
      offset: 0,
    });
  });

  it("enforces minimum page of 1", async () => {
    vi.mocked(getUserTransactions).mockResolvedValue({
      transactions: [],
      total: 0,
    });

    const app = createApp(mockUser);
    await app.request("/users/me/transactions?page=-1");

    expect(getUserTransactions).toHaveBeenCalledWith("user-1", {
      limit: 20,
      offset: 0, // (max(1,-1) - 1) * 20 = 0
    });
  });
});

describe("GET /users/me/issues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user issues", async () => {
    const mockIssues = [
      { id: "issue-1", title: "Bug in lodash", status: "open" },
      { id: "issue-2", title: "React crash", status: "patched" },
    ];
    vi.mocked(issueService.getUserIssues).mockResolvedValue(mockIssues);

    const app = createApp(mockUser);
    const res = await app.request("/users/me/issues");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("issue-1");
    expect(issueService.getUserIssues).toHaveBeenCalledWith("user-1");
  });
});

describe("GET /users/me/patches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user patches", async () => {
    const mockPatches = [
      { id: "patch-1", explanation: "Fix lodash bug", issueId: "issue-1" },
    ];
    vi.mocked(patchService.getUserPatches).mockResolvedValue(mockPatches);

    const app = createApp(mockUser);
    const res = await app.request("/users/me/patches");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("patch-1");
    expect(patchService.getUserPatches).toHaveBeenCalledWith("user-1");
  });
});

describe("GET /users/me/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns activity with default params", async () => {
    const mockActivity = {
      summary: { issuesReported: 5, patchesSubmitted: 3, verificationsGiven: 2 },
      recent: {},
      actionable: [],
      _next_actions: ["No items need attention right now"],
    };
    vi.mocked(getMyActivity).mockResolvedValue(mockActivity);

    const app = createApp(mockUser);
    const res = await app.request("/users/me/activity");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(getMyActivity).toHaveBeenCalledWith("user-1", {
      type: undefined,
      outcome: undefined,
      limit: 20,
    });
  });

  it("passes type and outcome filters", async () => {
    vi.mocked(getMyActivity).mockResolvedValue({
      summary: {},
      recent: {},
      actionable: [],
      _next_actions: [],
    });

    const app = createApp(mockUser);
    await app.request("/users/me/activity?type=patches&outcome=fixed");

    expect(getMyActivity).toHaveBeenCalledWith("user-1", {
      type: "patches",
      outcome: "fixed",
      limit: 20,
    });
  });

  it("caps limit at 50", async () => {
    vi.mocked(getMyActivity).mockResolvedValue({
      summary: {},
      recent: {},
      actionable: [],
      _next_actions: [],
    });

    const app = createApp(mockUser);
    await app.request("/users/me/activity?limit=100");

    expect(getMyActivity).toHaveBeenCalledWith("user-1", {
      type: undefined,
      outcome: undefined,
      limit: 50,
    });
  });

  it("enforces minimum limit of 1", async () => {
    vi.mocked(getMyActivity).mockResolvedValue({
      summary: {},
      recent: {},
      actionable: [],
      _next_actions: [],
    });

    const app = createApp(mockUser);
    await app.request("/users/me/activity?limit=0");

    expect(getMyActivity).toHaveBeenCalledWith("user-1", {
      type: undefined,
      outcome: undefined,
      limit: 1,
    });
  });

  it("passes custom limit value", async () => {
    vi.mocked(getMyActivity).mockResolvedValue({
      summary: {},
      recent: {},
      actionable: [],
      _next_actions: [],
    });

    const app = createApp(mockUser);
    await app.request("/users/me/activity?limit=5");

    expect(getMyActivity).toHaveBeenCalledWith("user-1", {
      type: undefined,
      outcome: undefined,
      limit: 5,
    });
  });
});
