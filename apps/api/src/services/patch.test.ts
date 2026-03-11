import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  PATCH_REWARD,
  RELATION_DISPLAY_CONFIDENCE_MIN,
  RELATION_MAX_DISPLAYED_PER_ISSUE,
} from "@knownissue/shared";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockPrisma = {
  issue: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  patch: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  patchAccess: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

class PrismaClientKnownRequestError extends Error {
  code: string;
  constructor(message: string, { code }: { code: string }) {
    super(message);
    this.code = code;
  }
}

vi.mock("@knownissue/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError },
}));
vi.mock("./credits", () => ({
  awardCredits: vi.fn(),
  getCredits: vi.fn(),
}));
vi.mock("./audit", () => ({ logAudit: vi.fn() }));
vi.mock("./issue", () => ({ computeDerivedStatus: vi.fn() }));
vi.mock("./reward", () => ({ claimReportReward: vi.fn() }));
vi.mock("./relations", () => ({
  createRelation: vi.fn(),
  loadRelatedIssues: vi.fn(),
}));
vi.mock("./relationInference", () => ({ inferRelationsForPatch: vi.fn() }));

// Import after mocks
const { submitPatch, getPatchById, getPatchForAgent, getUserPatches } =
  await import("./patch");
const { awardCredits, getCredits } = await import("./credits") as {
  awardCredits: Mock;
  getCredits: Mock;
};
const { logAudit } = await import("./audit") as { logAudit: Mock };
const { computeDerivedStatus } = await import("./issue") as { computeDerivedStatus: Mock };
const { claimReportReward } = await import("./reward") as { claimReportReward: Mock };
const { createRelation, loadRelatedIssues } = await import("./relations") as {
  createRelation: Mock;
  loadRelatedIssues: Mock;
};
const { inferRelationsForPatch } = await import("./relationInference") as {
  inferRelationsForPatch: Mock;
};

// ── Helpers ─────────────────────────────────────────────────────────────

const defaultSteps = [{ type: "instruction" as const, text: "Do this" }];

function makePatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "patch-1",
    explanation: "Fix by doing X",
    steps: defaultSteps,
    versionConstraint: null,
    issueId: "issue-1",
    submitterId: "user-1",
    submitter: { id: "user-1", username: "fixer" },
    issue: { id: "issue-1", title: "Test issue", library: "lodash", version: "4.17.21" },
    createdAt: new Date("2024-01-02"),
    verifications: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadRelatedIssues.mockResolvedValue(new Map());
  inferRelationsForPatch.mockResolvedValue(undefined);
  computeDerivedStatus.mockResolvedValue(undefined);
  claimReportReward.mockResolvedValue(undefined);
  logAudit.mockResolvedValue(undefined);
});

// ── submitPatch ─────────────────────────────────────────────────────────

describe("submitPatch", () => {
  it("throws when issue not found", async () => {
    mockPrisma.issue.findUnique.mockResolvedValue(null);

    await expect(
      submitPatch("missing-issue", "Fix it", defaultSteps, null, "user-1")
    ).rejects.toThrow("Issue not found");
  });

  describe("updating existing patch", () => {
    it("updates patch without awarding credits", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({ id: "issue-1" });
      mockPrisma.patch.findUnique.mockResolvedValue({ id: "patch-1" });
      mockPrisma.patch.update.mockResolvedValue({
        id: "patch-1",
        submitter: { id: "user-1" },
        issue: { title: "Test" },
      });
      getCredits.mockResolvedValue(10);

      const result = await submitPatch(
        "issue-1",
        "Updated explanation",
        defaultSteps,
        ">=1.0.0",
        "user-1",
      );

      expect(result.creditsAwarded).toBe(0);
      expect(result.updated).toBe(true);
      expect(result.creditsBalance).toBe(10);
      expect(awardCredits).not.toHaveBeenCalled();
    });

    it("logs audit for patch update", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({ id: "issue-1" });
      mockPrisma.patch.findUnique.mockResolvedValue({ id: "patch-1" });
      mockPrisma.patch.update.mockResolvedValue({
        id: "patch-1",
        submitter: { id: "user-1" },
        issue: { title: "Test" },
      });
      getCredits.mockResolvedValue(10);

      await submitPatch("issue-1", "Updated", defaultSteps, null, "user-1");

      expect(logAudit).toHaveBeenCalledWith({
        action: "update",
        entityType: "patch",
        entityId: "patch-1",
        actorId: "user-1",
        metadata: { issueId: "issue-1" },
      });
    });

    it("recomputes derived status on update", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({ id: "issue-1" });
      mockPrisma.patch.findUnique.mockResolvedValue({ id: "patch-1" });
      mockPrisma.patch.update.mockResolvedValue({
        id: "patch-1",
        submitter: { id: "user-1" },
        issue: { title: "Test" },
      });
      getCredits.mockResolvedValue(10);

      await submitPatch("issue-1", "Updated", defaultSteps, null, "user-1");

      expect(computeDerivedStatus).toHaveBeenCalledWith("issue-1");
    });

    it("returns _next_actions indicating update", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({ id: "issue-1" });
      mockPrisma.patch.findUnique.mockResolvedValue({ id: "patch-1" });
      mockPrisma.patch.update.mockResolvedValue({
        id: "patch-1",
        submitter: { id: "user-1" },
        issue: { title: "Test" },
      });
      getCredits.mockResolvedValue(10);

      const result = await submitPatch("issue-1", "Updated", defaultSteps, null, "user-1");

      expect(result._next_actions[0]).toContain("updated");
    });
  });

  describe("creating new patch", () => {
    beforeEach(() => {
      mockPrisma.issue.findUnique.mockResolvedValue({ id: "issue-1" });
      mockPrisma.patch.findUnique.mockResolvedValue(null); // no existing patch
      mockPrisma.patch.create.mockResolvedValue(makePatch());
      awardCredits.mockResolvedValue(10);
    });

    it("creates patch and awards PATCH_REWARD credits", async () => {
      const result = await submitPatch(
        "issue-1",
        "Fix by doing X",
        defaultSteps,
        null,
        "user-1",
      );

      expect(mockPrisma.patch.create).toHaveBeenCalledWith({
        data: {
          explanation: "Fix by doing X",
          steps: defaultSteps,
          versionConstraint: null,
          issueId: "issue-1",
          submitterId: "user-1",
        },
        include: {
          submitter: { select: { id: true, displayName: true, avatarUrl: true } },
          issue: { select: { title: true } },
        },
      });
      expect(result.creditsAwarded).toBe(PATCH_REWARD);
      expect(result.updated).toBe(false);
    });

    it("awards credits with correct metadata", async () => {
      await submitPatch("issue-1", "Fix", defaultSteps, null, "user-1");

      expect(awardCredits).toHaveBeenCalledWith("user-1", PATCH_REWARD, "patch_submitted", {
        issueId: "issue-1",
        patchId: "patch-1",
      });
    });

    it("logs audit for new patch", async () => {
      await submitPatch("issue-1", "Fix", defaultSteps, null, "user-1");

      expect(logAudit).toHaveBeenCalledWith({
        action: "create",
        entityType: "patch",
        entityId: "patch-1",
        actorId: "user-1",
        metadata: { issueId: "issue-1" },
      });
    });

    it("recomputes derived status", async () => {
      await submitPatch("issue-1", "Fix", defaultSteps, null, "user-1");

      expect(computeDerivedStatus).toHaveBeenCalledWith("issue-1");
    });

    it("claims deferred report reward", async () => {
      await submitPatch("issue-1", "Fix", defaultSteps, null, "user-1");

      expect(claimReportReward).toHaveBeenCalledWith("issue-1", "user-1");
    });

    it("fires relation inference (fire-and-forget)", async () => {
      await submitPatch("issue-1", "Fix", defaultSteps, null, "user-1");

      expect(inferRelationsForPatch).toHaveBeenCalledWith("patch-1", "issue-1");
    });

    it("handles relatedTo parameter", async () => {
      createRelation.mockResolvedValue(true);

      await submitPatch("issue-1", "Fix", defaultSteps, null, "user-1", {
        issueId: "issue-2",
        type: "shared_fix",
        note: "Same approach",
      });

      expect(createRelation).toHaveBeenCalledWith({
        sourceIssueId: "issue-1",
        targetIssueId: "issue-2",
        type: "shared_fix",
        source: "agent",
        confidence: 1.0,
        metadata: { note: "Same approach" },
        createdById: "user-1",
      });
    });

    it("does not call createRelation when relatedTo is absent", async () => {
      await submitPatch("issue-1", "Fix", defaultSteps, null, "user-1");

      expect(createRelation).not.toHaveBeenCalled();
    });

    it("adds _warnings when createRelation returns false", async () => {
      createRelation.mockResolvedValue(false);

      const result = await submitPatch("issue-1", "Fix", defaultSteps, null, "user-1", {
        issueId: "issue-2",
        type: "shared_fix",
      });

      expect(result._warnings).toEqual([
        "Relation was not created — target issue may not exist or relation already exists",
      ]);
    });

    it("omits _warnings when createRelation succeeds", async () => {
      createRelation.mockResolvedValue(true);

      const result = await submitPatch("issue-1", "Fix", defaultSteps, null, "user-1", {
        issueId: "issue-2",
        type: "shared_fix",
      });

      expect(result._warnings).toBeUndefined();
    });

    it("handles null versionConstraint", async () => {
      await submitPatch("issue-1", "Fix", defaultSteps, undefined, "user-1");

      const createCall = mockPrisma.patch.create.mock.calls[0][0];
      expect(createCall.data.versionConstraint).toBeNull();
    });

    it("returns _next_actions for new patch", async () => {
      const result = await submitPatch("issue-1", "Fix", defaultSteps, null, "user-1");

      expect(result._next_actions[0]).toContain("live");
      expect(result._next_actions[1]).toContain("my_activity");
    });
  });
});

// ── getPatchById ────────────────────────────────────────────────────────

describe("getPatchById", () => {
  it("returns null when patch not found", async () => {
    mockPrisma.patch.findUnique.mockResolvedValue(null);

    const result = await getPatchById("missing-patch");

    expect(result).toBeNull();
  });

  it("returns patch with related issues", async () => {
    const patch = makePatch();
    mockPrisma.patch.findUnique.mockResolvedValue(patch);
    const relatedMap = new Map([
      ["issue-1", [{ issueId: "issue-2", relationType: "same_root_cause" }]],
    ]);
    loadRelatedIssues.mockResolvedValue(relatedMap);

    const result = await getPatchById("patch-1");

    expect(result!.issue.relatedIssues).toHaveLength(1);
    expect(loadRelatedIssues).toHaveBeenCalledWith(
      ["issue-1"],
      { minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN, maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE },
    );
  });

  it("returns empty relatedIssues when none found", async () => {
    const patch = makePatch();
    mockPrisma.patch.findUnique.mockResolvedValue(patch);

    const result = await getPatchById("patch-1");

    expect(result!.issue.relatedIssues).toEqual([]);
  });
});

// ── getPatchForAgent ────────────────────────────────────────────────────

describe("getPatchForAgent", () => {
  it("throws when patch not found", async () => {
    mockPrisma.patch.findUnique.mockResolvedValue(null);

    await expect(getPatchForAgent("missing-patch", "user-1")).rejects.toThrow(
      "Patch not found"
    );
  });

  it("creates PatchAccess and increments accessCount", async () => {
    const patch = makePatch();
    mockPrisma.patch.findUnique.mockResolvedValue(patch);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        patchAccess: { create: vi.fn() },
        issue: { update: vi.fn() },
      };
      await fn(tx);
    });

    const result = await getPatchForAgent("patch-1", "user-2");

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(computeDerivedStatus).toHaveBeenCalledWith("issue-1");
    expect(claimReportReward).toHaveBeenCalledWith("issue-1", "user-2");
    expect(result._next_actions[0]).toContain("verify");
  });

  it("silently handles duplicate PatchAccess (unique constraint)", async () => {
    const patch = makePatch();
    mockPrisma.patch.findUnique.mockResolvedValue(patch);
    mockPrisma.$transaction.mockRejectedValue(
      new PrismaClientKnownRequestError("Unique constraint", { code: "P2002" })
    );

    const result = await getPatchForAgent("patch-1", "user-2");

    // Should not throw — catches P2002 specifically
    expect(result.relatedIssues).toEqual([]);
    expect(result._next_actions).toBeDefined();
  });

  it("loads related issues for the parent issue", async () => {
    const patch = makePatch();
    mockPrisma.patch.findUnique.mockResolvedValue(patch);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        patchAccess: { create: vi.fn() },
        issue: { update: vi.fn() },
      };
      await fn(tx);
    });

    const relatedMap = new Map([
      ["issue-1", [{ issueId: "issue-2", relationType: "shared_fix" }]],
    ]);
    loadRelatedIssues.mockResolvedValue(relatedMap);

    const result = await getPatchForAgent("patch-1", "user-2");

    expect(result.relatedIssues).toHaveLength(1);
    expect(loadRelatedIssues).toHaveBeenCalledWith(
      ["issue-1"],
      { minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN, maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE },
    );
  });

  it("does not call computeDerivedStatus when PatchAccess already exists", async () => {
    const patch = makePatch();
    mockPrisma.patch.findUnique.mockResolvedValue(patch);
    mockPrisma.$transaction.mockRejectedValue(
      new PrismaClientKnownRequestError("Unique constraint", { code: "P2002" })
    );

    await getPatchForAgent("patch-1", "user-2");

    expect(computeDerivedStatus).not.toHaveBeenCalled();
    expect(claimReportReward).not.toHaveBeenCalled();
  });

  it("re-throws non-P2002 errors from PatchAccess transaction", async () => {
    const patch = makePatch();
    mockPrisma.patch.findUnique.mockResolvedValue(patch);
    mockPrisma.$transaction.mockRejectedValue(new Error("Connection lost"));

    await expect(getPatchForAgent("patch-1", "user-2")).rejects.toThrow("Connection lost");
  });
});

// ── getUserPatches ──────────────────────────────────────────────────────

describe("getUserPatches", () => {
  it("queries by submitterId", async () => {
    mockPrisma.patch.findMany.mockResolvedValue([]);

    await getUserPatches("user-1");

    expect(mockPrisma.patch.findMany).toHaveBeenCalledWith({
      where: { submitterId: "user-1" },
      include: {
        issue: { select: { id: true, title: true } },
        _count: { select: { verifications: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });
});
