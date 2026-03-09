import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTx = {
  issue: {
    update: vi.fn(),
  },
  issueRevision: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("@knownissue/db", () => ({
  prisma: {
    issue: {
      findUnique: vi.fn(),
    },
    issueRevision: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("./audit", () => ({
  logAudit: vi.fn(),
}));

import { prisma } from "@knownissue/db";
import { logAudit } from "./audit";
import {
  createIssueRevision,
  getIssueRevisions,
  getIssueRevision,
  rollbackIssue,
} from "./revision";

const mockIssueFindUnique = prisma.issue.findUnique as ReturnType<typeof vi.fn>;
const mockRevFindFirst = prisma.issueRevision.findFirst as ReturnType<
  typeof vi.fn
>;
const mockRevFindMany = prisma.issueRevision.findMany as ReturnType<
  typeof vi.fn
>;
const mockRevFindUnique = prisma.issueRevision.findUnique as ReturnType<
  typeof vi.fn
>;
const mockRevCreate = prisma.issueRevision.create as ReturnType<typeof vi.fn>;
const mockRevCount = prisma.issueRevision.count as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockLogAudit = logAudit as ReturnType<typeof vi.fn>;

const baseIssue = {
  id: "issue-1",
  title: "Test Issue",
  description: "Description here",
  errorMessage: "Something failed",
  errorCode: "E001",
  stackTrace: "at line 1",
  fingerprint: "fp-abc",
  triggerCode: "const x = 1;",
  expectedBehavior: "Should work",
  actualBehavior: "It broke",
  context: { key: "value" },
  contextLibraries: ["react", "next"],
  runtime: "node20",
  platform: "linux",
  category: "crash",
  accessCount: 5,
  searchHitCount: 10,
  severity: "high",
  status: "open",
  tags: ["bug", "urgent"],
  reporterId: "user-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createIssueRevision", () => {
  it("creates a revision with version 1 when no prior revisions exist", async () => {
    mockIssueFindUnique.mockResolvedValue(baseIssue);
    mockRevFindFirst.mockResolvedValue(null);
    mockRevCreate.mockResolvedValue({ id: "rev-1", version: 1 });

    const result = await createIssueRevision("issue-1", "create", "user-1");

    expect(result).toEqual({ id: "rev-1", version: 1 });
    expect(mockRevCreate).toHaveBeenCalledWith({
      data: {
        version: 1,
        action: "create",
        title: "Test Issue",
        description: "Description here",
        severity: "high",
        status: "open",
        tags: ["bug", "urgent"],
        snapshot: {
          errorMessage: "Something failed",
          errorCode: "E001",
          stackTrace: "at line 1",
          fingerprint: "fp-abc",
          triggerCode: "const x = 1;",
          expectedBehavior: "Should work",
          actualBehavior: "It broke",
          context: { key: "value" },
          contextLibraries: ["react", "next"],
          runtime: "node20",
          platform: "linux",
          category: "crash",
          accessCount: 5,
          searchHitCount: 10,
        },
        issueId: "issue-1",
        actorId: "user-1",
      },
    });
  });

  it("increments version from the last revision", async () => {
    mockIssueFindUnique.mockResolvedValue(baseIssue);
    mockRevFindFirst.mockResolvedValue({ version: 3 });
    mockRevCreate.mockResolvedValue({ id: "rev-4", version: 4 });

    await createIssueRevision("issue-1", "update", "user-1");

    expect(mockRevCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 4,
        action: "update",
      }),
    });
  });

  it("throws when issue is not found", async () => {
    mockIssueFindUnique.mockResolvedValue(null);

    await expect(
      createIssueRevision("nonexistent", "create", "user-1")
    ).rejects.toThrow("Issue not found");
  });

  it("handles issue with null optional fields gracefully", async () => {
    const sparseIssue = {
      ...baseIssue,
      title: null,
      description: null,
      errorMessage: null,
      errorCode: null,
      stackTrace: null,
      triggerCode: null,
      expectedBehavior: null,
      actualBehavior: null,
      context: null,
      contextLibraries: [],
      runtime: null,
      platform: null,
      category: null,
    };
    mockIssueFindUnique.mockResolvedValue(sparseIssue);
    mockRevFindFirst.mockResolvedValue(null);
    mockRevCreate.mockResolvedValue({ id: "rev-1", version: 1 });

    await createIssueRevision("issue-1", "create", "user-1");

    expect(mockRevCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "",
        description: "",
        snapshot: expect.objectContaining({
          errorMessage: null,
          context: null,
          contextLibraries: [],
        }),
      }),
    });
  });
});

describe("getIssueRevisions", () => {
  it("returns paginated revisions with total count", async () => {
    const mockRevisions = [
      { id: "rev-2", version: 2 },
      { id: "rev-1", version: 1 },
    ];
    mockRevFindMany.mockResolvedValue(mockRevisions);
    mockRevCount.mockResolvedValue(2);

    const result = await getIssueRevisions("issue-1", {
      limit: 10,
      offset: 0,
    });

    expect(result.revisions).toEqual(mockRevisions);
    expect(result.total).toBe(2);
    expect(mockRevFindMany).toHaveBeenCalledWith({
      where: { issueId: "issue-1" },
      orderBy: { version: "desc" },
      take: 10,
      skip: 0,
    });
  });

  it("uses default limit=10 and offset=0", async () => {
    mockRevFindMany.mockResolvedValue([]);
    mockRevCount.mockResolvedValue(0);

    await getIssueRevisions("issue-1");

    expect(mockRevFindMany).toHaveBeenCalledWith({
      where: { issueId: "issue-1" },
      orderBy: { version: "desc" },
      take: 10,
      skip: 0,
    });
  });

  it("applies custom pagination", async () => {
    mockRevFindMany.mockResolvedValue([]);
    mockRevCount.mockResolvedValue(50);

    await getIssueRevisions("issue-1", { limit: 5, offset: 20 });

    expect(mockRevFindMany).toHaveBeenCalledWith({
      where: { issueId: "issue-1" },
      orderBy: { version: "desc" },
      take: 5,
      skip: 20,
    });
  });
});

describe("getIssueRevision", () => {
  it("returns a specific revision by issueId and version", async () => {
    const mockRev = { id: "rev-1", version: 2, issueId: "issue-1" };
    mockRevFindUnique.mockResolvedValue(mockRev);

    const result = await getIssueRevision("issue-1", 2);

    expect(result).toEqual(mockRev);
    expect(mockRevFindUnique).toHaveBeenCalledWith({
      where: { issueId_version: { issueId: "issue-1", version: 2 } },
    });
  });

  it("returns null when revision does not exist", async () => {
    mockRevFindUnique.mockResolvedValue(null);

    const result = await getIssueRevision("issue-1", 999);

    expect(result).toBeNull();
  });
});

describe("rollbackIssue", () => {
  const revision = {
    id: "rev-1",
    version: 1,
    title: "Original Title",
    description: "Original desc",
    severity: "low",
    status: "open",
    tags: ["original"],
    snapshot: {
      errorMessage: "Original error",
      errorCode: "E001",
      stackTrace: "original stack",
      triggerCode: "original code",
      expectedBehavior: "original expected",
      actualBehavior: "original actual",
      context: { original: true },
      contextLibraries: ["react"],
      runtime: "node18",
      platform: "darwin",
      category: "build",
    },
  };

  it("restores issue from snapshot and creates rollback revision", async () => {
    mockIssueFindUnique.mockResolvedValue(baseIssue);
    mockRevFindUnique.mockResolvedValue(revision);

    const restoredIssue = { ...baseIssue, title: "Original Title" };

    mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
      mockTx.issue.update.mockResolvedValue(restoredIssue);
      mockTx.issueRevision.findFirst.mockResolvedValue({ version: 3 });
      mockTx.issueRevision.create.mockResolvedValue({
        id: "rev-4",
        version: 4,
      });
      return fn(mockTx);
    });

    mockLogAudit.mockResolvedValue({});

    const result = await rollbackIssue("issue-1", 1, "user-1");

    expect(result).toEqual(restoredIssue);

    // Verify issue was updated with snapshot data
    expect(mockTx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: {
        title: "Original Title",
        description: "Original desc",
        severity: "low",
        status: "open",
        tags: ["original"],
        errorMessage: "Original error",
        errorCode: "E001",
        stackTrace: "original stack",
        triggerCode: "original code",
        expectedBehavior: "original expected",
        actualBehavior: "original actual",
        context: { original: true },
        contextLibraries: ["react"],
        runtime: "node18",
        platform: "darwin",
        category: "build",
      },
      include: { reporter: true },
    });

    // Verify rollback revision was created
    expect(mockTx.issueRevision.create).toHaveBeenCalledWith({
      data: {
        version: 4,
        action: "rollback",
        title: "Original Title",
        description: "Original desc",
        severity: "low",
        status: "open",
        tags: ["original"],
        snapshot: revision.snapshot,
        issueId: "issue-1",
        actorId: "user-1",
      },
    });

    // Verify audit log
    expect(mockLogAudit).toHaveBeenCalledWith({
      action: "rollback",
      entityType: "issue",
      entityId: "issue-1",
      actorId: "user-1",
      metadata: { rolledBackToVersion: 1 },
    });
  });

  it("throws when issue is not found", async () => {
    mockIssueFindUnique.mockResolvedValue(null);

    await expect(rollbackIssue("nonexistent", 1, "user-1")).rejects.toThrow(
      "Issue not found"
    );
  });

  it("throws when actor is not the reporter", async () => {
    mockIssueFindUnique.mockResolvedValue({
      ...baseIssue,
      reporterId: "reporter-1",
    });

    await expect(
      rollbackIssue("issue-1", 1, "someone-else")
    ).rejects.toThrow("Only the reporter can rollback this issue");
  });

  it("throws when target revision does not exist", async () => {
    mockIssueFindUnique.mockResolvedValue(baseIssue);
    mockRevFindUnique.mockResolvedValue(null);

    await expect(rollbackIssue("issue-1", 999, "user-1")).rejects.toThrow(
      "Revision version 999 not found"
    );
  });

  it("handles revision without snapshot (null snapshot)", async () => {
    const revisionNoSnapshot = {
      ...revision,
      snapshot: null,
    };

    mockIssueFindUnique.mockResolvedValue(baseIssue);
    mockRevFindUnique.mockResolvedValue(revisionNoSnapshot);

    const restoredIssue = { ...baseIssue };

    mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
      mockTx.issue.update.mockResolvedValue(restoredIssue);
      mockTx.issueRevision.findFirst.mockResolvedValue({ version: 2 });
      mockTx.issueRevision.create.mockResolvedValue({
        id: "rev-3",
        version: 3,
      });
      return fn(mockTx);
    });
    mockLogAudit.mockResolvedValue({});

    await rollbackIssue("issue-1", 1, "user-1");

    // When snapshot is null, restoreData only has the individual columns
    expect(mockTx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: {
        title: "Original Title",
        description: "Original desc",
        severity: "low",
        status: "open",
        tags: ["original"],
      },
      include: { reporter: true },
    });
  });

  it("creates rollback revision with correct incremented version", async () => {
    mockIssueFindUnique.mockResolvedValue(baseIssue);
    mockRevFindUnique.mockResolvedValue(revision);

    mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
      mockTx.issue.update.mockResolvedValue(baseIssue);
      mockTx.issueRevision.findFirst.mockResolvedValue({ version: 7 });
      mockTx.issueRevision.create.mockResolvedValue({
        id: "rev-8",
        version: 8,
      });
      return fn(mockTx);
    });
    mockLogAudit.mockResolvedValue({});

    await rollbackIssue("issue-1", 1, "user-1");

    expect(mockTx.issueRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 8,
        action: "rollback",
      }),
    });
  });

  it("creates rollback revision with version 1 when no prior revisions in transaction", async () => {
    mockIssueFindUnique.mockResolvedValue(baseIssue);
    mockRevFindUnique.mockResolvedValue(revision);

    mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
      mockTx.issue.update.mockResolvedValue(baseIssue);
      mockTx.issueRevision.findFirst.mockResolvedValue(null);
      mockTx.issueRevision.create.mockResolvedValue({
        id: "rev-1",
        version: 1,
      });
      return fn(mockTx);
    });
    mockLogAudit.mockResolvedValue({});

    await rollbackIssue("issue-1", 1, "user-1");

    expect(mockTx.issueRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 1,
      }),
    });
  });
});
