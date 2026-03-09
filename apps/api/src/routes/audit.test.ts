import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import type { User } from "@knownissue/shared";

// Mock auth middleware
vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn().mockImplementation(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// Mock service layer
vi.mock("../services/audit", () => ({
  getEntityAuditLog: vi.fn(),
}));

import { audit } from "./audit";
import { getEntityAuditLog } from "../services/audit";

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

  app.route("/", audit);
  return app;
}

describe("GET /audit/:entityType/:entityId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns audit logs for a valid entity type", async () => {
    const mockLogs = {
      logs: [
        {
          id: "log-1",
          action: "create",
          entityType: "issue",
          entityId: "issue-1",
          actorId: "user-1",
          createdAt: new Date("2025-01-01"),
        },
      ],
      total: 1,
    };
    vi.mocked(getEntityAuditLog).mockResolvedValue(mockLogs);

    const app = createApp(mockUser);
    const res = await app.request("/audit/issue/issue-1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("passes entity type and id to service", async () => {
    vi.mocked(getEntityAuditLog).mockResolvedValue({ logs: [], total: 0 });

    const app = createApp(mockUser);
    await app.request("/audit/patch/patch-123");

    expect(getEntityAuditLog).toHaveBeenCalledWith("patch", "patch-123", {
      limit: 20,
      offset: 0,
    });
  });

  it("returns 400 for invalid entity type", async () => {
    const app = createApp(mockUser);
    const res = await app.request("/audit/invalid/entity-1");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid entity type");
  });

  it("accepts issue entity type", async () => {
    vi.mocked(getEntityAuditLog).mockResolvedValue({ logs: [], total: 0 });

    const app = createApp(mockUser);
    const res = await app.request("/audit/issue/entity-1");

    expect(res.status).toBe(200);
    expect(getEntityAuditLog).toHaveBeenCalledWith("issue", "entity-1", expect.any(Object));
  });

  it("accepts patch entity type", async () => {
    vi.mocked(getEntityAuditLog).mockResolvedValue({ logs: [], total: 0 });

    const app = createApp(mockUser);
    const res = await app.request("/audit/patch/entity-1");

    expect(res.status).toBe(200);
  });

  it("accepts verification entity type", async () => {
    vi.mocked(getEntityAuditLog).mockResolvedValue({ logs: [], total: 0 });

    const app = createApp(mockUser);
    const res = await app.request("/audit/verification/entity-1");

    expect(res.status).toBe(200);
  });

  it("accepts user entity type", async () => {
    vi.mocked(getEntityAuditLog).mockResolvedValue({ logs: [], total: 0 });

    const app = createApp(mockUser);
    const res = await app.request("/audit/user/entity-1");

    expect(res.status).toBe(200);
  });

  it("rejects bogus entity type", async () => {
    const app = createApp(mockUser);
    const res = await app.request("/audit/foobar/entity-1");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Must be: issue, patch, verification, or user");
  });

  it("passes limit and offset query params", async () => {
    vi.mocked(getEntityAuditLog).mockResolvedValue({ logs: [], total: 0 });

    const app = createApp(mockUser);
    await app.request("/audit/issue/issue-1?limit=10&offset=5");

    expect(getEntityAuditLog).toHaveBeenCalledWith("issue", "issue-1", {
      limit: 10,
      offset: 5,
    });
  });

  it("caps limit at 50", async () => {
    vi.mocked(getEntityAuditLog).mockResolvedValue({ logs: [], total: 0 });

    const app = createApp(mockUser);
    await app.request("/audit/issue/issue-1?limit=100");

    expect(getEntityAuditLog).toHaveBeenCalledWith("issue", "issue-1", {
      limit: 50,
      offset: 0,
    });
  });

  it("enforces minimum limit of 1", async () => {
    vi.mocked(getEntityAuditLog).mockResolvedValue({ logs: [], total: 0 });

    const app = createApp(mockUser);
    await app.request("/audit/issue/issue-1?limit=0");

    expect(getEntityAuditLog).toHaveBeenCalledWith("issue", "issue-1", {
      limit: 1,
      offset: 0,
    });
  });

  it("enforces minimum offset of 0", async () => {
    vi.mocked(getEntityAuditLog).mockResolvedValue({ logs: [], total: 0 });

    const app = createApp(mockUser);
    await app.request("/audit/issue/issue-1?offset=-5");

    expect(getEntityAuditLog).toHaveBeenCalledWith("issue", "issue-1", {
      limit: 20,
      offset: 0,
    });
  });

  it("uses defaults when params are not provided", async () => {
    vi.mocked(getEntityAuditLog).mockResolvedValue({ logs: [], total: 0 });

    const app = createApp(mockUser);
    await app.request("/audit/issue/issue-1");

    expect(getEntityAuditLog).toHaveBeenCalledWith("issue", "issue-1", {
      limit: 20,
      offset: 0,
    });
  });
});
