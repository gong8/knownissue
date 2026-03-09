import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@knownissue/db", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from "@knownissue/db";
import { logAudit, getEntityAuditLog, getUserAuditLog } from "./audit";

const mockCreate = prisma.auditLog.create as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.auditLog.findMany as ReturnType<typeof vi.fn>;
const mockCount = prisma.auditLog.count as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logAudit", () => {
  it("creates an audit log entry with required fields", async () => {
    const mockEntry = { id: "audit-1" };
    mockCreate.mockResolvedValue(mockEntry);

    const result = await logAudit({
      action: "create",
      entityType: "issue",
      entityId: "issue-1",
      actorId: "user-1",
    });

    expect(result).toEqual(mockEntry);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        action: "create",
        entityType: "issue",
        entityId: "issue-1",
        actorId: "user-1",
        changes: undefined,
        metadata: undefined,
      },
    });
  });

  it("includes changes when provided", async () => {
    mockCreate.mockResolvedValue({ id: "audit-2" });

    const changes = {
      title: { from: "Old title", to: "New title" },
      severity: { from: "low", to: "high" },
    };

    await logAudit({
      action: "update",
      entityType: "issue",
      entityId: "issue-1",
      actorId: "user-1",
      changes,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes,
      }),
    });
  });

  it("includes metadata when provided", async () => {
    mockCreate.mockResolvedValue({ id: "audit-3" });

    const metadata = { rolledBackToVersion: 2, reason: "bad edit" };

    await logAudit({
      action: "rollback",
      entityType: "issue",
      entityId: "issue-1",
      actorId: "user-1",
      metadata,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata,
      }),
    });
  });

  it("includes both changes and metadata", async () => {
    mockCreate.mockResolvedValue({ id: "audit-4" });

    await logAudit({
      action: "update",
      entityType: "patch",
      entityId: "patch-1",
      actorId: "user-1",
      changes: { steps: { from: "old", to: "new" } },
      metadata: { source: "mcp" },
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        action: "update",
        entityType: "patch",
        entityId: "patch-1",
        actorId: "user-1",
        changes: { steps: { from: "old", to: "new" } },
        metadata: { source: "mcp" },
      },
    });
  });

  it("handles all entity types", async () => {
    mockCreate.mockResolvedValue({ id: "audit-5" });

    for (const entityType of [
      "issue",
      "patch",
      "verification",
      "user",
    ] as const) {
      await logAudit({
        action: "create",
        entityType,
        entityId: "entity-1",
        actorId: "user-1",
      });
    }

    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it("handles all action types", async () => {
    mockCreate.mockResolvedValue({ id: "audit-6" });

    for (const action of [
      "create",
      "update",
      "delete",
      "rollback",
    ] as const) {
      await logAudit({
        action,
        entityType: "issue",
        entityId: "issue-1",
        actorId: "user-1",
      });
    }

    expect(mockCreate).toHaveBeenCalledTimes(4);
  });
});

describe("getEntityAuditLog", () => {
  it("returns paginated logs with total count", async () => {
    const mockLogs = [
      { id: "audit-1", action: "create", actor: { id: "user-1" } },
      { id: "audit-2", action: "update", actor: { id: "user-1" } },
    ];
    mockFindMany.mockResolvedValue(mockLogs);
    mockCount.mockResolvedValue(10);

    const result = await getEntityAuditLog("issue", "issue-1", {
      limit: 5,
      offset: 0,
    });

    expect(result.logs).toEqual(mockLogs);
    expect(result.total).toBe(10);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { entityType: "issue", entityId: "issue-1" },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      skip: 0,
    });
    expect(mockCount).toHaveBeenCalledWith({
      where: { entityType: "issue", entityId: "issue-1" },
    });
  });

  it("uses default limit=20 and offset=0", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getEntityAuditLog("issue", "issue-1");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { entityType: "issue", entityId: "issue-1" },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 0,
    });
  });

  it("applies custom pagination", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(50);

    await getEntityAuditLog("patch", "patch-1", { limit: 3, offset: 9 });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { entityType: "patch", entityId: "patch-1" },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 3,
      skip: 9,
    });
  });

  it("returns empty logs with zero total", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const result = await getEntityAuditLog("verification", "v-1");

    expect(result.logs).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("getUserAuditLog", () => {
  it("returns paginated logs for a specific user", async () => {
    const mockLogs = [{ id: "audit-1", action: "create" }];
    mockFindMany.mockResolvedValue(mockLogs);
    mockCount.mockResolvedValue(25);

    const result = await getUserAuditLog("user-1", { limit: 10, offset: 5 });

    expect(result.logs).toEqual(mockLogs);
    expect(result.total).toBe(25);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { actorId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 10,
      skip: 5,
    });
    expect(mockCount).toHaveBeenCalledWith({
      where: { actorId: "user-1" },
    });
  });

  it("uses default limit=20 and offset=0", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getUserAuditLog("user-1");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { actorId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 0,
    });
  });

  it("returns empty results for user with no audit entries", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const result = await getUserAuditLog("user-new");

    expect(result.logs).toEqual([]);
    expect(result.total).toBe(0);
  });
});
