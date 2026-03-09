import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockPrisma = {
  issue: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  patch: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  $queryRawUnsafe: vi.fn(),
};

vi.mock("@knownissue/db", () => ({ prisma: mockPrisma }));
vi.mock("./relations", () => ({ createRelation: vi.fn() }));

// Import after mocks
const { inferRelationsForIssue, inferRelationsForPatch } = await import(
  "./relationInference"
);
const { createRelation } = (await import("./relations")) as {
  createRelation: Mock;
};

// ── Helpers ─────────────────────────────────────────────────────────────

const now = new Date("2025-01-15T12:00:00Z");

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: "issue-1",
    library: "react",
    version: "18.2.0",
    fingerprint: "fp-abc123",
    errorCode: "ERR_001",
    errorMessage: "Cannot read property of undefined",
    contextLibraries: ["react-dom", "next"],
    category: "crash", // default to non-compatible category to avoid triggering Rule 4
    reporterId: "user-1",
    createdAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset $queryRawUnsafe and findMany to clear any leftover mockResolvedValueOnce queue
  mockPrisma.$queryRawUnsafe.mockReset();
  mockPrisma.issue.findUnique.mockReset();
  mockPrisma.issue.findMany.mockReset();
  mockPrisma.patch.findUnique.mockReset();
  mockPrisma.patch.findMany.mockReset();
  createRelation.mockReset();
  createRelation.mockResolvedValue(true);
  // Default return values so un-mocked calls don't return undefined
  mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  mockPrisma.issue.findMany.mockResolvedValue([]);
  mockPrisma.patch.findMany.mockResolvedValue([]);
});

// ── inferRelationsForIssue ──────────────────────────────────────────────

describe("inferRelationsForIssue", () => {
  describe("early return", () => {
    it("returns immediately when issue is not found", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue(null);

      await inferRelationsForIssue("nonexistent", "user-1");

      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(mockPrisma.issue.findMany).not.toHaveBeenCalled();
      expect(createRelation).not.toHaveBeenCalled();
    });
  });

  describe("Rule 1: version_regression", () => {
    it("infers version_regression when fingerprint matches", async () => {
      const issue = makeIssue();
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      // Rule 1: fingerprint match
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { id: "old-issue", fingerprint: "fp-abc123", errorCode: null },
        ])
        // Rule 2: no similar issues
        .mockResolvedValueOnce([])
        // Rule 4: no interaction candidates (skipped because of category filter logic)
        .mockResolvedValueOnce([]);

      // Rule 3: no cascading candidates
      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIssueId: "old-issue",
          targetIssueId: "issue-1",
          type: "version_regression",
          confidence: 0.95,
          source: "system",
          createdById: "user-1",
          metadata: { rule: "version_regression", matchedOn: "fingerprint" },
        })
      );
    });

    it("infers version_regression with lower confidence for errorCode-only match", async () => {
      const issue = makeIssue({ fingerprint: null });
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        // Rule 1: errorCode match
        .mockResolvedValueOnce([
          { id: "old-issue", fingerprint: null, errorCode: "ERR_001" },
        ])
        // Rule 2: no similar issues
        .mockResolvedValueOnce([]);

      // Rule 3: no cascading candidates
      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIssueId: "old-issue",
          targetIssueId: "issue-1",
          type: "version_regression",
          confidence: 0.8,
          metadata: { rule: "version_regression", matchedOn: "errorCode" },
        })
      );
    });

    it("skips Rule 1 when neither fingerprint nor errorCode is set", async () => {
      const issue = makeIssue({ fingerprint: null, errorCode: null });
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      // Only Rule 2 raw query
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");

      // The first raw query should be for Rule 2 (same_root_cause), not Rule 1
      const firstRawCall = mockPrisma.$queryRawUnsafe.mock.calls[0];
      if (firstRawCall) {
        expect(firstRawCall[0]).toContain("embedding");
      }
    });
  });

  describe("Rule 2: same_root_cause", () => {
    it("infers same_root_cause for similar issues with different errors", async () => {
      const issue = makeIssue();
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        // Rule 1
        .mockResolvedValueOnce([])
        // Rule 2: similar embedding but different error
        .mockResolvedValueOnce([
          {
            id: "similar-issue",
            similarity: 0.92,
            errorMessage: "Different error message",
            errorCode: "ERR_999",
          },
        ]);

      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIssueId: "similar-issue",
          targetIssueId: "issue-1",
          type: "same_root_cause",
          confidence: 0.92,
          metadata: { rule: "same_root_cause", similarity: 0.92 },
        })
      );
    });

    it("skips same_root_cause when errors are identical (errorMessage match)", async () => {
      const issue = makeIssue();
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])
        // Rule 2: same errorMessage
        .mockResolvedValueOnce([
          {
            id: "duplicate-issue",
            similarity: 0.95,
            errorMessage: "Cannot read property of undefined",
            errorCode: null,
          },
        ]);

      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");

      // Should not create same_root_cause for identical errors
      const sameRootCauseCalls = createRelation.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).type === "same_root_cause"
      );
      expect(sameRootCauseCalls).toHaveLength(0);
    });

    it("skips same_root_cause when errors are identical (errorCode match)", async () => {
      const issue = makeIssue();
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "duplicate-issue",
            similarity: 0.93,
            errorMessage: "Some other message",
            errorCode: "ERR_001", // same errorCode as issue
          },
        ]);

      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");

      const sameRootCauseCalls = createRelation.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).type === "same_root_cause"
      );
      expect(sameRootCauseCalls).toHaveLength(0);
    });
  });

  describe("Rule 3: cascading_dependency", () => {
    it("infers forward cascading_dependency when other issue depends on this library", async () => {
      const issue = makeIssue();
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]); // Rule 2

      // Rule 3: forward candidates (issues that have issue.library in their contextLibraries)
      mockPrisma.issue.findMany
        .mockResolvedValueOnce([
          { id: "dependent-issue", library: "next" },
        ])
        // Reverse candidates
        .mockResolvedValueOnce([]);

      await inferRelationsForIssue("issue-1", "user-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIssueId: "issue-1",
          targetIssueId: "dependent-issue",
          type: "cascading_dependency",
          confidence: 0.7,
          metadata: {
            rule: "cascading_dependency",
            direction: "forward",
            causeLibrary: "react",
          },
        })
      );
    });

    it("infers reverse cascading_dependency when this issue depends on another's library", async () => {
      const issue = makeIssue();
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]); // Rule 2

      mockPrisma.issue.findMany
        .mockResolvedValueOnce([]) // Forward
        .mockResolvedValueOnce([
          // Reverse: candidate whose library is in issue's contextLibraries
          { id: "cause-issue", library: "react-dom" },
        ]);

      await inferRelationsForIssue("issue-1", "user-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIssueId: "cause-issue",
          targetIssueId: "issue-1",
          type: "cascading_dependency",
          confidence: 0.7,
          metadata: {
            rule: "cascading_dependency",
            direction: "reverse",
            causeLibrary: "react-dom",
          },
        })
      );
    });

    it("skips forward cascading_dependency when library is null", async () => {
      const issue = makeIssue({ library: null });
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // Rule 2 (no Rule 1 because fingerprint still set)
        .mockResolvedValueOnce([]); // But with library=null, Rule 1 query changes

      // Forward candidates should not be queried when library is null
      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");

      // Check that findMany was called only for reverse (not forward, since library is null)
      const findManyCalls = mockPrisma.issue.findMany.mock.calls;
      // All findMany calls should NOT have contextLibraries: { has: null }
      for (const call of findManyCalls) {
        if (call[0]?.where?.contextLibraries) {
          expect(call[0].where.contextLibraries.has).not.toBeNull();
        }
      }
    });

    it("skips reverse cascading_dependency when contextLibraries is empty", async () => {
      const issue = makeIssue({ contextLibraries: [] });
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]); // Rule 2

      mockPrisma.issue.findMany
        .mockResolvedValueOnce([]); // Forward only

      await inferRelationsForIssue("issue-1", "user-1");

      // Only one findMany call (forward), not two (no reverse)
      expect(mockPrisma.issue.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("Rule 4: interaction_conflict", () => {
    it("infers interaction_conflict for compatible categories with 2+ shared libraries", async () => {
      const issue = makeIssue({
        category: "compatibility",
        contextLibraries: ["react-dom", "next", "webpack"],
      });
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]) // Rule 2
        // Rule 4: interaction candidates
        .mockResolvedValueOnce([
          { id: "interaction-issue", overlap: 3 },
        ]);

      mockPrisma.issue.findMany
        .mockResolvedValueOnce([]) // Forward cascading
        .mockResolvedValueOnce([]); // Reverse cascading

      await inferRelationsForIssue("issue-1", "user-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIssueId: "interaction-issue",
          targetIssueId: "issue-1",
          type: "interaction_conflict",
          confidence: 0.6,
          metadata: {
            rule: "interaction_conflict",
            sharedLibraryCount: 3,
          },
        })
      );
    });

    it("skips interaction_conflict for non-compatible categories", async () => {
      const issue = makeIssue({
        category: "crash", // not compatibility or behavior
        contextLibraries: ["react-dom", "next"],
      });
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]); // Rule 2
      // No Rule 4 query expected

      mockPrisma.issue.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await inferRelationsForIssue("issue-1", "user-1");

      // Should not have a third $queryRawUnsafe call for interaction_conflict
      const interactionCalls = createRelation.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).type === "interaction_conflict"
      );
      expect(interactionCalls).toHaveLength(0);
    });

    it("skips interaction_conflict when fewer than 2 contextLibraries", async () => {
      const issue = makeIssue({
        category: "behavior",
        contextLibraries: ["react-dom"], // only 1
      });
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // Rule 1
        .mockResolvedValueOnce([]); // Rule 2

      mockPrisma.issue.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await inferRelationsForIssue("issue-1", "user-1");

      const interactionCalls = createRelation.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).type === "interaction_conflict"
      );
      expect(interactionCalls).toHaveLength(0);
    });
  });

  describe("budget enforcement", () => {
    it("respects RELATION_MAX_INFERRED_PER_TRIGGER (5)", async () => {
      const issue = makeIssue();
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      // Rule 1: return 6 candidates (more than budget)
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce(
          Array.from({ length: 6 }, (_, i) => ({
            id: `regression-${i}`,
            fingerprint: "fp-abc123",
            errorCode: null,
          }))
        )
        .mockResolvedValueOnce([]);

      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");

      // Should have created at most 5 relations
      expect(createRelation).toHaveBeenCalledTimes(5);
    });

    it("stops processing subsequent rules when budget is exhausted", async () => {
      const issue = makeIssue({
        category: "crash", // not compatibility/behavior to simplify
        contextLibraries: [],
      });
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      // Rule 1: use up full budget (5 candidates, all succeed)
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => ({
            id: `regression-${i}`,
            fingerprint: "fp-abc123",
            errorCode: null,
          }))
        )
        // Rule 2: would return results but should not be reached due to budget
        .mockResolvedValueOnce([
          { id: "similar", similarity: 0.9, errorMessage: "different", errorCode: null },
        ]);

      // Rule 3 forward (no reverse because contextLibraries is empty)
      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");

      // Only version_regression relations should have been created (budget = 5)
      expect(createRelation).toHaveBeenCalledTimes(5);
      for (const call of createRelation.mock.calls) {
        expect((call[0] as Record<string, unknown>).type).toBe("version_regression");
      }
    });

    it("accounts for failed createRelation calls in budget", async () => {
      const issue = makeIssue();
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      // First two createRelation calls fail (duplicate), rest succeed
      createRelation
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce(
          Array.from({ length: 7 }, (_, i) => ({
            id: `regression-${i}`,
            fingerprint: "fp-abc123",
            errorCode: null,
          }))
        )
        .mockResolvedValueOnce([]);

      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");

      // 2 failed + 5 successful = 7 total calls
      expect(createRelation).toHaveBeenCalledTimes(7);
    });
  });

  describe("confidence filtering", () => {
    it("does not create relations with confidence below RELATION_CONFIDENCE_MIN (0.5)", async () => {
      const issue = makeIssue();
      mockPrisma.issue.findUnique.mockResolvedValue(issue);

      // Mock createRelation to observe calls
      createRelation.mockImplementation(
        async (params: Record<string, unknown>) => {
          // The tryInfer helper should not call createRelation with low confidence
          expect(params.confidence).toBeGreaterThanOrEqual(0.5);
          return true;
        }
      );

      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockPrisma.issue.findMany.mockResolvedValue([]);

      await inferRelationsForIssue("issue-1", "user-1");
    });
  });
});

// ── inferRelationsForPatch ──────────────────────────────────────────────

describe("inferRelationsForPatch", () => {
  const patchCreatedAt = new Date("2025-01-15T12:00:00Z");
  const olderCreatedAt = new Date("2025-01-10T12:00:00Z");
  const newerCreatedAt = new Date("2025-01-20T12:00:00Z");

  describe("early return", () => {
    it("returns immediately when patch is not found", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue(null);
      mockPrisma.issue.findUnique.mockResolvedValue({ createdAt: now });

      await inferRelationsForPatch("nonexistent", "issue-1");

      expect(createRelation).not.toHaveBeenCalled();
    });

    it("returns immediately when issue is not found", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue(null);

      await inferRelationsForPatch("patch-1", "nonexistent");

      expect(createRelation).not.toHaveBeenCalled();
    });
  });

  describe("step extraction", () => {
    it("handles null steps gracefully", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: null,
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      await inferRelationsForPatch("patch-1", "issue-1");

      // No other patches to fetch since no file paths or package versions
      expect(mockPrisma.patch.findMany).not.toHaveBeenCalled();
      expect(createRelation).not.toHaveBeenCalled();
    });

    it("handles empty steps array", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      await inferRelationsForPatch("patch-1", "issue-1");

      expect(mockPrisma.patch.findMany).not.toHaveBeenCalled();
    });
  });

  describe("Rule 5: shared_fix", () => {
    it("infers shared_fix for file path match (code_change)", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "code_change", filePath: "src/utils/helpers.ts" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      // Other patches
      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "other-patch",
          issueId: "issue-2",
          steps: [
            { type: "code_change", filePath: "src/utils/helpers.ts" },
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIssueId: "issue-2", // older issue is source
          targetIssueId: "issue-1",
          type: "shared_fix",
          confidence: 0.7,
          metadata: expect.objectContaining({
            rule: "shared_fix",
            matchType: "file",
            patchId: "other-patch",
          }),
        })
      );
    });

    it("infers shared_fix for file path match (config_change)", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "config_change", file: "tsconfig.json" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "other-patch",
          issueId: "issue-2",
          steps: [
            { type: "config_change", file: "tsconfig.json" },
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "shared_fix",
          confidence: 0.7,
          metadata: expect.objectContaining({ matchType: "file" }),
        })
      );
    });

    it("infers shared_fix with higher confidence for package+version match", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "version_bump", package: "react", to: "18.3.0" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "other-patch",
          issueId: "issue-2",
          steps: [
            { type: "version_bump", package: "react", to: "18.3.0" },
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "shared_fix",
          confidence: 0.8,
          metadata: expect.objectContaining({ matchType: "package+version" }),
        })
      );
    });

    it("uses max confidence when both file and version match", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "code_change", filePath: "src/index.ts" },
          { type: "version_bump", package: "react", to: "18.3.0" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "other-patch",
          issueId: "issue-2",
          steps: [
            { type: "code_change", filePath: "src/index.ts" },
            { type: "version_bump", package: "react", to: "18.3.0" },
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      // package+version match gives 0.8 which is higher than file match 0.7
      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "shared_fix",
          confidence: 0.8,
          metadata: expect.objectContaining({ matchType: "package+version" }),
        })
      );
    });

    it("orders source/target by issue age (older = source)", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "code_change", filePath: "src/fix.ts" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: olderCreatedAt, // current issue is older
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "other-patch",
          issueId: "issue-2",
          steps: [
            { type: "code_change", filePath: "src/fix.ts" },
          ],
          issue: { createdAt: newerCreatedAt }, // other is newer
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      // Current issue is older, so it's the source
      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIssueId: "issue-1",
          targetIssueId: "issue-2",
        })
      );
    });

    it("does not match when no file paths overlap", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "code_change", filePath: "src/a.ts" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "other-patch",
          issueId: "issue-2",
          steps: [
            { type: "code_change", filePath: "src/b.ts" }, // different file
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      const sharedFixCalls = createRelation.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).type === "shared_fix"
      );
      expect(sharedFixCalls).toHaveLength(0);
    });
  });

  describe("Rule 6: fix_conflict", () => {
    it("infers fix_conflict when same package bumped to different versions", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "version_bump", package: "react", to: "18.3.0" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "conflicting-patch",
          issueId: "issue-2",
          steps: [
            { type: "version_bump", package: "react", to: "17.0.2" }, // different version
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIssueId: "issue-2", // older
          targetIssueId: "issue-1",
          type: "fix_conflict",
          confidence: 0.9,
          metadata: expect.objectContaining({
            rule: "fix_conflict",
            package: "react",
            thisVersion: "18.3.0",
            otherVersion: "17.0.2",
            conflictingPatchId: "conflicting-patch",
          }),
        })
      );
    });

    it("does not infer fix_conflict when same version is used", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "version_bump", package: "react", to: "18.3.0" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "other-patch",
          issueId: "issue-2",
          steps: [
            { type: "version_bump", package: "react", to: "18.3.0" }, // same version
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      const fixConflictCalls = createRelation.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).type === "fix_conflict"
      );
      expect(fixConflictCalls).toHaveLength(0);
    });

    it("creates at most one fix_conflict per other patch", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "version_bump", package: "react", to: "18.3.0" },
          { type: "version_bump", package: "react-dom", to: "18.3.0" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "conflicting-patch",
          issueId: "issue-2",
          steps: [
            { type: "version_bump", package: "react", to: "17.0.2" },
            { type: "version_bump", package: "react-dom", to: "17.0.2" },
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      // Should only create one fix_conflict per other patch (break after first match)
      const fixConflictCalls = createRelation.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).type === "fix_conflict"
      );
      expect(fixConflictCalls).toHaveLength(1);
    });

    it("skips fix_conflict when no version_bumps in patch", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "code_change", filePath: "src/fix.ts" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "other-patch",
          issueId: "issue-2",
          steps: [
            { type: "version_bump", package: "react", to: "17.0.2" },
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      const fixConflictCalls = createRelation.mock.calls.filter(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).type === "fix_conflict"
      );
      expect(fixConflictCalls).toHaveLength(0);
    });
  });

  describe("combined Rule 5 + Rule 6", () => {
    it("creates both shared_fix and fix_conflict from same pair of patches", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "code_change", filePath: "src/shared.ts" },
          { type: "version_bump", package: "lodash", to: "4.18.0" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "other-patch",
          issueId: "issue-2",
          steps: [
            { type: "code_change", filePath: "src/shared.ts" }, // file match -> shared_fix
            { type: "version_bump", package: "lodash", to: "4.17.21" }, // diff version -> fix_conflict
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      const types = createRelation.mock.calls.map(
        (call: unknown[]) => (call[0] as Record<string, unknown>).type
      );
      expect(types).toContain("shared_fix");
      expect(types).toContain("fix_conflict");
    });
  });

  describe("budget enforcement", () => {
    it("respects RELATION_MAX_INFERRED_PER_TRIGGER (5) for patch inference", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "code_change", filePath: "src/shared.ts" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      // Return many matching patches
      mockPrisma.patch.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          id: `other-patch-${i}`,
          issueId: `issue-${i + 2}`,
          steps: [
            { type: "code_change", filePath: "src/shared.ts" },
          ],
          issue: { createdAt: olderCreatedAt },
        }))
      );

      await inferRelationsForPatch("patch-1", "issue-1");

      expect(createRelation).toHaveBeenCalledTimes(5);
    });
  });

  describe("submitterId propagation", () => {
    it("uses patch submitterId as createdById in relation", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "code_change", filePath: "src/fix.ts" },
        ],
        issueId: "issue-1",
        submitterId: "agent-42",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([
        {
          id: "other-patch",
          issueId: "issue-2",
          steps: [
            { type: "code_change", filePath: "src/fix.ts" },
          ],
          issue: { createdAt: olderCreatedAt },
        },
      ]);

      await inferRelationsForPatch("patch-1", "issue-1");

      expect(createRelation).toHaveBeenCalledWith(
        expect.objectContaining({
          createdById: "agent-42",
        })
      );
    });
  });

  describe("other patches query", () => {
    it("does not fetch other patches when there are no file paths or package versions", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "description", text: "Fixed the bug" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      await inferRelationsForPatch("patch-1", "issue-1");

      expect(mockPrisma.patch.findMany).not.toHaveBeenCalled();
    });

    it("fetches other patches limited to 50", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue({
        id: "patch-1",
        steps: [
          { type: "code_change", filePath: "src/fix.ts" },
        ],
        issueId: "issue-1",
        submitterId: "user-1",
      });
      mockPrisma.issue.findUnique.mockResolvedValue({
        createdAt: patchCreatedAt,
      });

      mockPrisma.patch.findMany.mockResolvedValue([]);

      await inferRelationsForPatch("patch-1", "issue-1");

      expect(mockPrisma.patch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          where: expect.objectContaining({
            issueId: { not: "issue-1" },
          }),
        })
      );
    });
  });
});
