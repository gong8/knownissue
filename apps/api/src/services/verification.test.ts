import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  VERIFY_REWARD,
  PATCH_VERIFIED_FIXED_REWARD,
  PATCH_VERIFIED_NOT_FIXED_PENALTY,
  DAILY_VERIFICATION_CAP,
} from "@knownissue/shared";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockPrisma = {
  patch: {
    findUnique: vi.fn(),
  },
  verification: {
    findUnique: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock("@knownissue/db", () => ({ prisma: mockPrisma }));
vi.mock("./credits", () => ({
  awardCredits: vi.fn(),
  penalizeCredits: vi.fn(),
}));
vi.mock("./audit", () => ({ logAudit: vi.fn() }));
vi.mock("./issue", () => ({ computeDerivedStatus: vi.fn() }));

// Import after mocks
const { verify } = await import("./verification");
const { awardCredits, penalizeCredits } = await import("./credits") as {
  awardCredits: Mock;
  penalizeCredits: Mock;
};
const { logAudit } = await import("./audit") as { logAudit: Mock };
const { computeDerivedStatus } = await import("./issue") as { computeDerivedStatus: Mock };

// ── Helpers ─────────────────────────────────────────────────────────────

function makePatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "patch-1",
    issueId: "issue-1",
    submitterId: "author-1",
    submitter: { id: "author-1", username: "author" },
    ...overrides,
  };
}

function makeVerification(overrides: Record<string, unknown> = {}) {
  return {
    id: "verification-1",
    outcome: "fixed",
    note: null,
    errorBefore: null,
    errorAfter: null,
    testedVersion: null,
    issueAccuracy: null,
    patchId: "patch-1",
    verifierId: "verifier-1",
    verifier: { id: "verifier-1", username: "verifier" },
    createdAt: new Date("2024-01-03"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  logAudit.mockResolvedValue(undefined);
  computeDerivedStatus.mockResolvedValue(undefined);
  awardCredits.mockResolvedValue(7);
});

// ── verify ──────────────────────────────────────────────────────────────

describe("verify", () => {
  describe("validation errors", () => {
    it("throws when patch not found", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue(null);

      await expect(
        verify("missing-patch", "fixed", null, null, null, null, undefined, "verifier-1")
      ).rejects.toThrow("Patch not found");
    });

    it("throws when trying to verify own patch", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue(makePatch({ submitterId: "user-1" }));

      await expect(
        verify("patch-1", "fixed", null, null, null, null, undefined, "user-1")
      ).rejects.toThrow("Cannot verify your own patch");
    });

    it("throws when user has already verified this patch", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue(makePatch());
      mockPrisma.verification.findUnique.mockResolvedValue({ id: "existing-v" });

      await expect(
        verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1")
      ).rejects.toThrow("You have already verified this patch");
    });

    it("throws when daily verification cap reached", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue(makePatch());
      mockPrisma.verification.findUnique.mockResolvedValue(null);
      mockPrisma.verification.count.mockResolvedValue(DAILY_VERIFICATION_CAP);

      await expect(
        verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1")
      ).rejects.toThrow("Daily verification limit reached");
    });

    it("allows verification just under the cap", async () => {
      mockPrisma.patch.findUnique.mockResolvedValue(makePatch());
      mockPrisma.verification.findUnique.mockResolvedValue(null);
      mockPrisma.verification.count.mockResolvedValue(DAILY_VERIFICATION_CAP - 1);
      mockPrisma.verification.create.mockResolvedValue(makeVerification());

      await expect(
        verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1")
      ).resolves.toBeDefined();
    });
  });

  describe("successful verification", () => {
    beforeEach(() => {
      mockPrisma.patch.findUnique.mockResolvedValue(makePatch());
      mockPrisma.verification.findUnique.mockResolvedValue(null);
      mockPrisma.verification.count.mockResolvedValue(0);
      mockPrisma.verification.create.mockResolvedValue(makeVerification());
    });

    it("creates verification record with all fields", async () => {
      await verify(
        "patch-1",
        "fixed",
        "Confirmed fix",
        "Error before",
        "No error after",
        "4.17.22",
        "accurate",
        "verifier-1",
      );

      expect(mockPrisma.verification.create).toHaveBeenCalledWith({
        data: {
          outcome: "fixed",
          note: "Confirmed fix",
          errorBefore: "Error before",
          errorAfter: "No error after",
          testedVersion: "4.17.22",
          issueAccuracy: "accurate",
          patchId: "patch-1",
          verifierId: "verifier-1",
        },
        include: { verifier: { select: { id: true, displayName: true, avatarUrl: true } } },
      });
    });

    it("defaults issueAccuracy to null when undefined", async () => {
      await verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1");

      const call = mockPrisma.verification.create.mock.calls[0][0];
      expect(call.data.issueAccuracy).toBeNull();
    });

    it("defaults optional fields to null", async () => {
      await verify("patch-1", "fixed", null, undefined, undefined, undefined, undefined, "verifier-1");

      const call = mockPrisma.verification.create.mock.calls[0][0];
      expect(call.data.errorBefore).toBeNull();
      expect(call.data.errorAfter).toBeNull();
      expect(call.data.testedVersion).toBeNull();
    });

    it("awards VERIFY_REWARD to verifier", async () => {
      await verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1");

      expect(awardCredits).toHaveBeenCalledWith(
        "verifier-1",
        VERIFY_REWARD,
        "verification_given",
        { patchId: "patch-1" },
      );
    });

    it("logs audit with outcome", async () => {
      await verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1");

      expect(logAudit).toHaveBeenCalledWith({
        action: "create",
        entityType: "verification",
        entityId: "verification-1",
        actorId: "verifier-1",
        metadata: { patchId: "patch-1", outcome: "fixed" },
      });
    });

    it("recomputes derived status", async () => {
      await verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1");

      expect(computeDerivedStatus).toHaveBeenCalledWith("issue-1");
    });

    it("returns verifierCreditDelta equal to VERIFY_REWARD", async () => {
      const result = await verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1");

      expect(result.verifierCreditDelta).toBe(VERIFY_REWARD);
    });

    it("returns creditsBalance from awardCredits", async () => {
      awardCredits.mockResolvedValue(12);
      const result = await verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1");

      expect(result.creditsBalance).toBe(12);
    });

    it("returns _next_actions with thank you message", async () => {
      const result = await verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1");

      expect(result._next_actions[0]).toContain("working as intended");
    });
  });

  describe("outcome-specific author credit adjustments", () => {
    beforeEach(() => {
      mockPrisma.patch.findUnique.mockResolvedValue(makePatch());
      mockPrisma.verification.findUnique.mockResolvedValue(null);
      mockPrisma.verification.count.mockResolvedValue(0);
    });

    it("awards PATCH_VERIFIED_FIXED_REWARD to author on 'fixed'", async () => {
      mockPrisma.verification.create.mockResolvedValue(makeVerification({ outcome: "fixed" }));

      const result = await verify("patch-1", "fixed", null, null, null, null, undefined, "verifier-1");

      expect(awardCredits).toHaveBeenCalledWith(
        "author-1",
        PATCH_VERIFIED_FIXED_REWARD,
        "patch_verified_fixed",
        { patchId: "patch-1" },
      );
      expect(result.authorCreditDelta).toBe(PATCH_VERIFIED_FIXED_REWARD);
    });

    it("penalizes author PATCH_VERIFIED_NOT_FIXED_PENALTY on 'not_fixed'", async () => {
      mockPrisma.verification.create.mockResolvedValue(makeVerification({ outcome: "not_fixed" }));
      penalizeCredits.mockResolvedValue({ newBalance: 4, actualDeduction: PATCH_VERIFIED_NOT_FIXED_PENALTY });

      const result = await verify("patch-1", "not_fixed", null, null, null, null, undefined, "verifier-1");

      expect(penalizeCredits).toHaveBeenCalledWith(
        "author-1",
        PATCH_VERIFIED_NOT_FIXED_PENALTY,
        "patch_verified_not_fixed",
        { patchId: "patch-1" },
      );
      expect(result.authorCreditDelta).toBe(-PATCH_VERIFIED_NOT_FIXED_PENALTY);
    });

    it("does not adjust author credits on 'partial'", async () => {
      mockPrisma.verification.create.mockResolvedValue(makeVerification({ outcome: "partial" }));

      const result = await verify("patch-1", "partial", null, null, null, null, undefined, "verifier-1");

      // awardCredits called once for verifier, never for author
      expect(awardCredits).toHaveBeenCalledTimes(1);
      expect(awardCredits).toHaveBeenCalledWith(
        "verifier-1",
        VERIFY_REWARD,
        "verification_given",
        expect.any(Object),
      );
      expect(penalizeCredits).not.toHaveBeenCalled();
      expect(result.authorCreditDelta).toBe(0);
    });
  });
});
