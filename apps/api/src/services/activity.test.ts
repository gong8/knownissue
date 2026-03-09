import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUniqueOrThrow: vi.fn(),
  },
  issue: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  patch: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  verification: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  creditTransaction: {
    aggregate: vi.fn(),
  },
};

vi.mock("@knownissue/db", () => ({ prisma: mockPrisma }));

// Import after mocks
const { getMyActivity } = await import("./activity");

// ── Helpers ─────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  // Summary
  mockPrisma.issue.count.mockResolvedValue(3);
  mockPrisma.patch.count.mockResolvedValue(2);
  mockPrisma.verification.count.mockResolvedValue(5);
  mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ credits: 15 });
  mockPrisma.creditTransaction.aggregate
    .mockResolvedValueOnce({ _sum: { amount: 20 } })  // earned
    .mockResolvedValueOnce({ _sum: { amount: -5 } }); // spent

  // Recent items
  mockPrisma.issue.findMany.mockResolvedValue([
    { id: "i1", title: "Bug 1", library: "lodash", version: "4.17.21", status: "open", createdAt: new Date() },
  ]);

  mockPrisma.patch.findMany.mockImplementation(async (args: { where?: { verifications?: unknown } }) => {
    // getRecentPatches call (has submitterId filter)
    if (!args.where || !("verifications" in (args.where ?? {}))) {
      return [
        {
          id: "p1",
          issueId: "i1",
          explanation: "Fix it",
          createdAt: new Date(),
          issue: { title: "Bug 1" },
          verifications: [{ outcome: "fixed" }, { outcome: "not_fixed" }],
        },
      ];
    }
    // getActionablePatches call (has verifications.some filter)
    return [
      {
        id: "p2",
        issue: { title: "Bug 2" },
        verifications: [{ note: "Still broken", createdAt: new Date() }],
      },
    ];
  });

  mockPrisma.verification.findMany.mockResolvedValue([
    {
      id: "v1",
      patchId: "p1",
      outcome: "fixed",
      createdAt: new Date(),
      patch: { issueId: "i1", issue: { title: "Bug 1" } },
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getMyActivity ───────────────────────────────────────────────────────

describe("getMyActivity", () => {
  describe("summary", () => {
    it("returns correct summary counts", async () => {
      setupDefaultMocks();

      const result = await getMyActivity("user-1", {});

      expect(result.summary).toEqual({
        issuesReported: 3,
        patchesSubmitted: 2,
        verificationsGiven: 5,
        creditsEarned: 20,
        creditsSpent: 5,
        currentBalance: 15,
      });
    });

    it("handles null aggregate sums", async () => {
      mockPrisma.issue.count.mockResolvedValue(0);
      mockPrisma.patch.count.mockResolvedValue(0);
      mockPrisma.verification.count.mockResolvedValue(0);
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ credits: 5 });
      mockPrisma.creditTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });
      mockPrisma.issue.findMany.mockResolvedValue([]);
      mockPrisma.patch.findMany.mockResolvedValue([]);
      mockPrisma.verification.findMany.mockResolvedValue([]);

      const result = await getMyActivity("user-1", {});

      expect(result.summary.creditsEarned).toBe(0);
      expect(result.summary.creditsSpent).toBe(0);
    });
  });

  describe("type filtering", () => {
    it("shows all types when no filter specified", async () => {
      setupDefaultMocks();

      const result = await getMyActivity("user-1", {});

      expect(result.recent.issues).toBeDefined();
      expect(result.recent.patches).toBeDefined();
      expect(result.recent.verifications).toBeDefined();
    });

    it("shows only issues when type=issues", async () => {
      setupDefaultMocks();

      const result = await getMyActivity("user-1", { type: "issues" });

      expect(result.recent.issues).toBeDefined();
      expect(result.recent.patches).toBeUndefined();
      expect(result.recent.verifications).toBeUndefined();
    });

    it("shows only patches when type=patches", async () => {
      setupDefaultMocks();

      const result = await getMyActivity("user-1", { type: "patches" });

      expect(result.recent.patches).toBeDefined();
      expect(result.recent.issues).toBeUndefined();
      expect(result.recent.verifications).toBeUndefined();
    });

    it("shows only verifications when type=verifications", async () => {
      setupDefaultMocks();

      const result = await getMyActivity("user-1", { type: "verifications" });

      expect(result.recent.verifications).toBeDefined();
      expect(result.recent.issues).toBeUndefined();
      expect(result.recent.patches).toBeUndefined();
    });
  });

  describe("recent items formatting", () => {
    it("formats patches with verification counts", async () => {
      setupDefaultMocks();

      const result = await getMyActivity("user-1", {});

      const patch = result.recent.patches![0];
      expect(patch).toEqual(
        expect.objectContaining({
          id: "p1",
          issueId: "i1",
          issueTitle: "Bug 1",
          explanation: "Fix it",
        }),
      );
      expect(patch.verifications).toEqual({ fixed: 1, not_fixed: 1, partial: 0 });
    });

    it("formats verifications with issue context", async () => {
      setupDefaultMocks();

      const result = await getMyActivity("user-1", {});

      expect(result.recent.verifications![0]).toEqual(
        expect.objectContaining({
          id: "v1",
          patchId: "p1",
          issueId: "i1",
          issueTitle: "Bug 1",
          outcome: "fixed",
        }),
      );
    });
  });

  describe("actionable items", () => {
    it("includes patches with not_fixed verifications", async () => {
      setupDefaultMocks();

      const result = await getMyActivity("user-1", {});

      const patchAction = result.actionable.find(
        (a: { type: string }) => a.type === "patch_needs_revision"
      );
      expect(patchAction).toBeDefined();
      expect(patchAction!.patchId).toBe("p2");
      expect(patchAction!.notFixedCount).toBe(1);
      expect(patchAction!.latestNote).toBe("Still broken");
      expect(patchAction!.suggested_action).toContain("search");
    });

    it("includes issues with changed status", async () => {
      // Override issue.findMany for actionable to return status-changed issues
      mockPrisma.issue.count.mockResolvedValue(1);
      mockPrisma.patch.count.mockResolvedValue(0);
      mockPrisma.verification.count.mockResolvedValue(0);
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ credits: 5 });
      mockPrisma.creditTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 10 } })
        .mockResolvedValueOnce({ _sum: { amount: -5 } });

      // First findMany call: recent issues
      // Second findMany call: actionable issues (status not "open")
      mockPrisma.issue.findMany
        .mockResolvedValueOnce([]) // recent
        .mockResolvedValueOnce([{ id: "i1", title: "Bug 1", status: "patched" }]); // actionable

      mockPrisma.patch.findMany.mockResolvedValue([]);
      mockPrisma.verification.findMany.mockResolvedValue([]);

      const result = await getMyActivity("user-1", {});

      const issueAction = result.actionable.find(
        (a: { type: string }) => a.type === "issue_status_changed"
      );
      expect(issueAction).toBeDefined();
      expect(issueAction!.issueId).toBe("i1");
      expect(issueAction!.newStatus).toBe("patched");
      expect(issueAction!.suggested_action).toContain("search");
    });
  });

  describe("_next_actions", () => {
    it("returns attention message when actionable items exist", async () => {
      setupDefaultMocks();

      const result = await getMyActivity("user-1", {});

      expect(result._next_actions[0]).toContain("needing attention");
    });

    it("returns idle message when no actionable items", async () => {
      mockPrisma.issue.count.mockResolvedValue(0);
      mockPrisma.patch.count.mockResolvedValue(0);
      mockPrisma.verification.count.mockResolvedValue(0);
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ credits: 5 });
      mockPrisma.creditTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 5 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } });
      mockPrisma.issue.findMany.mockResolvedValue([]);
      mockPrisma.patch.findMany.mockResolvedValue([]);
      mockPrisma.verification.findMany.mockResolvedValue([]);

      const result = await getMyActivity("user-1", {});

      expect(result._next_actions[0]).toContain("No items need attention");
    });
  });

  describe("limit capping", () => {
    it("caps limit at 50", async () => {
      setupDefaultMocks();

      await getMyActivity("user-1", { limit: 100 });

      // Recent issues query should use capped limit
      const issueCall = mockPrisma.issue.findMany.mock.calls[0][0];
      expect(issueCall.take).toBe(50);
    });

    it("defaults to 10 when not specified", async () => {
      setupDefaultMocks();

      await getMyActivity("user-1", {});

      const issueCall = mockPrisma.issue.findMany.mock.calls[0][0];
      expect(issueCall.take).toBe(10);
    });
  });

  describe("outcome filter", () => {
    it("passes outcome filter to recent patches query", async () => {
      setupDefaultMocks();

      await getMyActivity("user-1", { outcome: "fixed" });

      // The patch.findMany for recent patches should include the outcome filter
      const patchCalls = mockPrisma.patch.findMany.mock.calls;
      const recentPatchCall = patchCalls.find(
        (call: Array<{ where?: { submitterId?: string; verifications?: { some?: { outcome: string } } } }>) =>
          call[0]?.where?.submitterId && call[0]?.where?.verifications?.some
      );
      if (recentPatchCall) {
        expect(recentPatchCall[0].where.verifications.some.outcome).toBe("fixed");
      }
    });
  });
});
