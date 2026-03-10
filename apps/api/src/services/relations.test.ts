import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockPrisma = {
  issue: {
    findUnique: vi.fn(),
  },
  issueRelation: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock("@knownissue/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@knownissue/db")>();
  return { prisma: mockPrisma, Prisma: actual.Prisma };
});
vi.mock("./audit", () => ({ logAudit: vi.fn() }));

// Import after mocks
const { createRelation, loadRelatedIssues } = await import("./relations");
const { logAudit } = await import("./audit") as { logAudit: Mock };

// ── Helpers ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  logAudit.mockResolvedValue(undefined);
});

// ── createRelation ──────────────────────────────────────────────────────

describe("createRelation", () => {
  describe("symmetric type ordering", () => {
    const symmetricTypes = ["same_root_cause", "interaction_conflict", "shared_fix", "fix_conflict"] as const;

    for (const type of symmetricTypes) {
      it(`enforces older issue = source for ${type}`, async () => {
        mockPrisma.issue.findUnique
          .mockResolvedValueOnce({ createdAt: new Date("2024-06-01") }) // source is newer
          .mockResolvedValueOnce({ createdAt: new Date("2024-01-01") }); // target is older
        mockPrisma.issueRelation.create.mockResolvedValue({});

        await createRelation({
          sourceIssueId: "newer-issue",
          targetIssueId: "older-issue",
          type,
          source: "agent",
          confidence: 1.0,
        });

        // Should swap: older becomes source
        expect(mockPrisma.issueRelation.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            sourceIssueId: "older-issue",
            targetIssueId: "newer-issue",
          }),
        });
      });

      it(`does not swap when source is already older for ${type}`, async () => {
        mockPrisma.issue.findUnique
          .mockResolvedValueOnce({ createdAt: new Date("2024-01-01") }) // source is older
          .mockResolvedValueOnce({ createdAt: new Date("2024-06-01") }); // target is newer
        mockPrisma.issueRelation.create.mockResolvedValue({});

        await createRelation({
          sourceIssueId: "older-issue",
          targetIssueId: "newer-issue",
          type,
          source: "agent",
          confidence: 1.0,
        });

        expect(mockPrisma.issueRelation.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            sourceIssueId: "older-issue",
            targetIssueId: "newer-issue",
          }),
        });
      });
    }

    it("returns false if either issue not found for symmetric types", async () => {
      mockPrisma.issue.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: new Date() });

      const result = await createRelation({
        sourceIssueId: "missing",
        targetIssueId: "exists",
        type: "same_root_cause",
        source: "agent",
        confidence: 1.0,
      });

      expect(result).toBe(false);
      expect(mockPrisma.issueRelation.create).not.toHaveBeenCalled();
    });
  });

  describe("directional types", () => {
    it("does not swap for version_regression", async () => {
      mockPrisma.issueRelation.create.mockResolvedValue({});

      await createRelation({
        sourceIssueId: "cause-issue",
        targetIssueId: "effect-issue",
        type: "version_regression",
        source: "system",
        confidence: 0.9,
      });

      // Should NOT look up issues for ordering
      expect(mockPrisma.issue.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.issueRelation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sourceIssueId: "cause-issue",
          targetIssueId: "effect-issue",
        }),
      });
    });

    it("does not swap for cascading_dependency", async () => {
      mockPrisma.issueRelation.create.mockResolvedValue({});

      await createRelation({
        sourceIssueId: "cause",
        targetIssueId: "effect",
        type: "cascading_dependency",
        source: "system",
        confidence: 0.7,
      });

      expect(mockPrisma.issue.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("self-relation prevention", () => {
    it("returns false for self-relation", async () => {
      const result = await createRelation({
        sourceIssueId: "issue-1",
        targetIssueId: "issue-1",
        type: "version_regression",
        source: "system",
        confidence: 0.9,
      });

      expect(result).toBe(false);
      expect(mockPrisma.issueRelation.create).not.toHaveBeenCalled();
    });

    it("returns false for self-relation after symmetric swap", async () => {
      // Both issues resolve to same ID after swap — edge case
      mockPrisma.issue.findUnique
        .mockResolvedValueOnce({ createdAt: new Date("2024-06-01") })
        .mockResolvedValueOnce({ createdAt: new Date("2024-01-01") });

      // After swap, sourceIssueId would become targetIssueId and vice versa
      // but they'd be different IDs, so this tests the check after swap
      const result = await createRelation({
        sourceIssueId: "issue-a",
        targetIssueId: "issue-a",
        type: "same_root_cause",
        source: "agent",
        confidence: 1.0,
      });

      // Self-relation check happens before the symmetric check since
      // both IDs are the same — but after swap they'd still be the same
      expect(result).toBe(false);
    });
  });

  describe("idempotency", () => {
    it("returns false on unique constraint violation", async () => {
      const { Prisma } = await import("@knownissue/db");
      mockPrisma.issueRelation.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6.0.0" })
      );

      const result = await createRelation({
        sourceIssueId: "issue-1",
        targetIssueId: "issue-2",
        type: "version_regression",
        source: "agent",
        confidence: 1.0,
      });

      expect(result).toBe(false);
    });
  });

  describe("successful creation", () => {
    it("creates relation and logs audit", async () => {
      mockPrisma.issueRelation.create.mockResolvedValue({});

      const result = await createRelation({
        sourceIssueId: "issue-1",
        targetIssueId: "issue-2",
        type: "version_regression",
        source: "agent",
        confidence: 0.95,
        metadata: { rule: "test" },
        createdById: "user-1",
      });

      expect(result).toBe(true);
      expect(mockPrisma.issueRelation.create).toHaveBeenCalledWith({
        data: {
          type: "version_regression",
          source: "agent",
          confidence: 0.95,
          metadata: { rule: "test" },
          sourceIssueId: "issue-1",
          targetIssueId: "issue-2",
          createdById: "user-1",
        },
      });
      expect(logAudit).toHaveBeenCalledWith({
        action: "create",
        entityType: "issue",
        entityId: "issue-1",
        actorId: "user-1",
        metadata: {
          relationType: "version_regression",
          targetIssueId: "issue-2",
          source: "agent",
          confidence: 0.95,
        },
      });
    });

    it("uses 'system' as actorId when createdById is not provided", async () => {
      mockPrisma.issueRelation.create.mockResolvedValue({});

      await createRelation({
        sourceIssueId: "issue-1",
        targetIssueId: "issue-2",
        type: "cascading_dependency",
        source: "system",
        confidence: 0.7,
      });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: "system" })
      );
    });

    it("handles undefined metadata", async () => {
      mockPrisma.issueRelation.create.mockResolvedValue({});

      await createRelation({
        sourceIssueId: "issue-1",
        targetIssueId: "issue-2",
        type: "cascading_dependency",
        source: "system",
        confidence: 0.7,
      });

      const call = mockPrisma.issueRelation.create.mock.calls[0][0];
      expect(call.data.metadata).toBeUndefined();
    });
  });
});

// ── loadRelatedIssues ───────────────────────────────────────────────────

describe("loadRelatedIssues", () => {
  it("returns empty map for empty input", async () => {
    const result = await loadRelatedIssues([]);

    expect(result).toEqual(new Map());
    expect(mockPrisma.issueRelation.findMany).not.toHaveBeenCalled();
  });

  it("loads relations from both directions", async () => {
    mockPrisma.issueRelation.findMany.mockResolvedValue([
      {
        type: "same_root_cause",
        source: "agent",
        confidence: 0.9,
        metadata: null,
        sourceIssueId: "issue-1",
        targetIssueId: "issue-2",
        sourceIssue: { id: "issue-1", title: "Issue 1", library: "lodash", version: "4.17.21" },
        targetIssue: { id: "issue-2", title: "Issue 2", library: "lodash", version: "4.17.22" },
      },
    ]);

    const result = await loadRelatedIssues(["issue-1"]);

    expect(result.get("issue-1")).toHaveLength(1);
    expect(result.get("issue-1")![0].issueId).toBe("issue-2"); // related is the target
  });

  it("loads from target direction too", async () => {
    mockPrisma.issueRelation.findMany.mockResolvedValue([
      {
        type: "version_regression",
        source: "system",
        confidence: 0.8,
        metadata: null,
        sourceIssueId: "issue-other",
        targetIssueId: "issue-1",
        sourceIssue: { id: "issue-other", title: "Other", library: "react", version: "17.0.0" },
        targetIssue: { id: "issue-1", title: "Ours", library: "react", version: "18.0.0" },
      },
    ]);

    const result = await loadRelatedIssues(["issue-1"]);

    expect(result.get("issue-1")).toHaveLength(1);
    expect(result.get("issue-1")![0].issueId).toBe("issue-other"); // related is the source
  });

  it("respects minConfidence filter", async () => {
    mockPrisma.issueRelation.findMany.mockResolvedValue([]);

    await loadRelatedIssues(["issue-1"], { minConfidence: 0.5 });

    const call = mockPrisma.issueRelation.findMany.mock.calls[0][0];
    expect(call.where.AND[0]).toEqual({ confidence: { gte: 0.5 } });
  });

  it("uses default minConfidence of 0.7", async () => {
    mockPrisma.issueRelation.findMany.mockResolvedValue([]);

    await loadRelatedIssues(["issue-1"]);

    const call = mockPrisma.issueRelation.findMany.mock.calls[0][0];
    expect(call.where.AND[0]).toEqual({ confidence: { gte: 0.7 } });
  });

  it("respects maxPerIssue limit", async () => {
    mockPrisma.issueRelation.findMany.mockResolvedValue([
      {
        type: "same_root_cause",
        source: "agent",
        confidence: 0.95,
        metadata: null,
        sourceIssueId: "issue-1",
        targetIssueId: "issue-2",
        sourceIssue: { id: "issue-1", title: "I1", library: null, version: null },
        targetIssue: { id: "issue-2", title: "I2", library: null, version: null },
      },
      {
        type: "version_regression",
        source: "system",
        confidence: 0.9,
        metadata: null,
        sourceIssueId: "issue-1",
        targetIssueId: "issue-3",
        sourceIssue: { id: "issue-1", title: "I1", library: null, version: null },
        targetIssue: { id: "issue-3", title: "I3", library: null, version: null },
      },
      {
        type: "shared_fix",
        source: "agent",
        confidence: 0.85,
        metadata: null,
        sourceIssueId: "issue-1",
        targetIssueId: "issue-4",
        sourceIssue: { id: "issue-1", title: "I1", library: null, version: null },
        targetIssue: { id: "issue-4", title: "I4", library: null, version: null },
      },
    ]);

    const result = await loadRelatedIssues(["issue-1"], { maxPerIssue: 2 });

    expect(result.get("issue-1")).toHaveLength(2);
  });

  it("uses default maxPerIssue of 3", async () => {
    const relations = Array.from({ length: 5 }, (_, i) => ({
      type: "same_root_cause",
      source: "agent",
      confidence: 0.95 - i * 0.01,
      metadata: null,
      sourceIssueId: "issue-1",
      targetIssueId: `issue-${i + 2}`,
      sourceIssue: { id: "issue-1", title: "I1", library: null, version: null },
      targetIssue: { id: `issue-${i + 2}`, title: `I${i + 2}`, library: null, version: null },
    }));
    mockPrisma.issueRelation.findMany.mockResolvedValue(relations);

    const result = await loadRelatedIssues(["issue-1"]);

    expect(result.get("issue-1")).toHaveLength(3);
  });

  it("extracts sharedPatchId from metadata for shared_fix type", async () => {
    mockPrisma.issueRelation.findMany.mockResolvedValue([
      {
        type: "shared_fix",
        source: "system",
        confidence: 0.8,
        metadata: { patchId: "patch-42" },
        sourceIssueId: "issue-1",
        targetIssueId: "issue-2",
        sourceIssue: { id: "issue-1", title: "I1", library: null, version: null },
        targetIssue: { id: "issue-2", title: "I2", library: null, version: null },
      },
    ]);

    const result = await loadRelatedIssues(["issue-1"]);

    expect(result.get("issue-1")![0].sharedPatchId).toBe("patch-42");
  });

  it("does not extract sharedPatchId for non-shared_fix types", async () => {
    mockPrisma.issueRelation.findMany.mockResolvedValue([
      {
        type: "same_root_cause",
        source: "agent",
        confidence: 0.9,
        metadata: { patchId: "patch-42" },
        sourceIssueId: "issue-1",
        targetIssueId: "issue-2",
        sourceIssue: { id: "issue-1", title: "I1", library: null, version: null },
        targetIssue: { id: "issue-2", title: "I2", library: null, version: null },
      },
    ]);

    const result = await loadRelatedIssues(["issue-1"]);

    expect(result.get("issue-1")![0].sharedPatchId).toBeUndefined();
  });

  it("handles both sides of a relation for queried issues", async () => {
    mockPrisma.issueRelation.findMany.mockResolvedValue([
      {
        type: "same_root_cause",
        source: "agent",
        confidence: 0.9,
        metadata: null,
        sourceIssueId: "issue-1",
        targetIssueId: "issue-2",
        sourceIssue: { id: "issue-1", title: "I1", library: null, version: null },
        targetIssue: { id: "issue-2", title: "I2", library: null, version: null },
      },
    ]);

    const result = await loadRelatedIssues(["issue-1", "issue-2"]);

    // Both sides should have related issues
    expect(result.get("issue-1")).toHaveLength(1);
    expect(result.get("issue-1")![0].issueId).toBe("issue-2");
    expect(result.get("issue-2")).toHaveLength(1);
    expect(result.get("issue-2")![0].issueId).toBe("issue-1");
  });

  it("queries with correct OR conditions for both directions", async () => {
    mockPrisma.issueRelation.findMany.mockResolvedValue([]);

    await loadRelatedIssues(["issue-1", "issue-2"]);

    const call = mockPrisma.issueRelation.findMany.mock.calls[0][0];
    expect(call.where.AND[1].OR).toEqual([
      { sourceIssueId: { in: ["issue-1", "issue-2"] } },
      { targetIssueId: { in: ["issue-1", "issue-2"] } },
    ]);
  });
});
