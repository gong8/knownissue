import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all dependencies ──────────────────────────────────────────────────

vi.mock("@knownissue/db", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    issue: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    patch: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    verification: {
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    creditTransaction: {
      create: vi.fn(),
    },
    patchAccess: {
      create: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("../services/embedding", () => ({
  generateEmbedding: vi.fn(),
}));
vi.mock("../services/fingerprint", () => ({
  computeFingerprint: vi.fn(),
  findByFingerprint: vi.fn(),
}));
vi.mock("../services/spam", () => ({
  checkDuplicate: vi.fn(),
  validateContent: vi.fn(),
}));
vi.mock("../services/audit", () => ({
  logAudit: vi.fn(),
}));
vi.mock("../services/revision", () => ({
  createIssueRevision: vi.fn(),
}));
vi.mock("../services/relations", () => ({
  createRelation: vi.fn(),
  loadRelatedIssues: vi.fn(),
}));
vi.mock("../services/relationInference", () => ({
  inferRelationsForIssue: vi.fn().mockResolvedValue([]),
  inferRelationsForPatch: vi.fn().mockResolvedValue([]),
}));

// Note: We do NOT mock credits, reward, patch, verification services.
// Instead we mock the prisma layer and test the real service functions.

import { prisma } from "@knownissue/db";
import {
  SIGNUP_BONUS,
  SEARCH_COST,
  REPORT_IMMEDIATE_REWARD,
  REPORT_DEFERRED_REWARD,
  PATCH_REWARD,
  VERIFY_REWARD,
  PATCH_VERIFIED_FIXED_REWARD,
  PATCH_VERIFIED_NOT_FIXED_PENALTY,
  DUPLICATE_PENALTY,
} from "@knownissue/shared";
import { generateEmbedding } from "../services/embedding";
import { computeFingerprint, findByFingerprint } from "../services/fingerprint";
import { checkDuplicate, validateContent } from "../services/spam";
import { loadRelatedIssues } from "../services/relations";
import { inferRelationsForIssue, inferRelationsForPatch } from "../services/relationInference";

const mockPrisma = prisma as unknown as {
  user: { findUniqueOrThrow: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  issue: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  patch: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  verification: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  creditTransaction: { create: ReturnType<typeof vi.fn> };
  patchAccess: { create: ReturnType<typeof vi.fn> };
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
  $executeRawUnsafe: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
};

const mockGenerateEmbedding = generateEmbedding as ReturnType<typeof vi.fn>;
const mockComputeFingerprint = computeFingerprint as ReturnType<typeof vi.fn>;
const mockFindByFingerprint = findByFingerprint as ReturnType<typeof vi.fn>;
const mockCheckDuplicate = checkDuplicate as ReturnType<typeof vi.fn>;
const mockValidateContent = validateContent as ReturnType<typeof vi.fn>;
const mockLoadRelatedIssues = loadRelatedIssues as ReturnType<typeof vi.fn>;
const mockInferRelationsForIssue = inferRelationsForIssue as ReturnType<typeof vi.fn>;
const mockInferRelationsForPatch = inferRelationsForPatch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  // Re-set defaults after clearAllMocks (vitest v4 clears mock implementations)
  mockLoadRelatedIssues.mockResolvedValue(new Map());
  mockInferRelationsForIssue.mockResolvedValue([]);
  mockInferRelationsForPatch.mockResolvedValue([]);
  mockValidateContent.mockReturnValue({ valid: true });
  mockComputeFingerprint.mockReturnValue(null);
  mockFindByFingerprint.mockResolvedValue(null);
  mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
  mockGenerateEmbedding.mockResolvedValue(null);
  // Interactive transaction: pass the same mock prisma as `tx`
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
  );
});

// ── A. Credit Constants Validation ─────────────────────────────────────────

describe("Credit Constants", () => {
  it("has correct credit values", () => {
    expect(SIGNUP_BONUS).toBe(5);
    expect(SEARCH_COST).toBe(1);
    expect(REPORT_IMMEDIATE_REWARD).toBe(1);
    expect(REPORT_DEFERRED_REWARD).toBe(2);
    expect(PATCH_REWARD).toBe(5);
    expect(VERIFY_REWARD).toBe(2);
    expect(PATCH_VERIFIED_FIXED_REWARD).toBe(1);
    expect(PATCH_VERIFIED_NOT_FIXED_PENALTY).toBe(1);
    expect(DUPLICATE_PENALTY).toBe(2);
  });
});

// ── B. Report Credits Flow ─────────────────────────────────────────────────

describe("Report Credits Flow", () => {
  it("awards REPORT_IMMEDIATE_REWARD (+1) on successful report", async () => {
    const { createIssue } = await vi.importActual<typeof import("../services/issue")>("../services/issue");
    const { awardCredits } = await vi.importActual<typeof import("../services/credits")>("../services/credits");

    // Setup: established user
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-reporter",
      createdAt: new Date("2024-01-01"),
      credits: 10,
    });
    mockPrisma.issue.count.mockResolvedValue(0);
    mockComputeFingerprint.mockReturnValue(null);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockValidateContent.mockReturnValue({ valid: true });
    mockGenerateEmbedding.mockResolvedValue(null);
    mockPrisma.issue.create.mockResolvedValue({
      id: "issue-1",
      reporter: { id: "user-reporter" },
    });
    mockPrisma.user.update.mockResolvedValue({ credits: 11 });
    mockPrisma.creditTransaction.create.mockResolvedValue({});

    const result = await createIssue(
      { errorMessage: "TypeError: Something went wrong" },
      "user-reporter"
    );

    expect(result.creditsAwarded).toBe(REPORT_IMMEDIATE_REWARD);
    // Verify awardCredits was called with correct amount
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-reporter" },
        data: { credits: { increment: REPORT_IMMEDIATE_REWARD } },
      })
    );
  });

  it("penalizes DUPLICATE_PENALTY (-2) on duplicate report via fingerprint", async () => {
    const { createIssue } = await vi.importActual<typeof import("../services/issue")>("../services/issue");

    // First call: user lookup in createIssue
    // Second call: penalizeCredits reads balance before penalty
    // Third call: penalizeCredits reads balance after penalty
    mockPrisma.user.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: "user-dup",
        createdAt: new Date("2024-01-01"),
        credits: 10,
      })
      .mockResolvedValueOnce({ credits: 10 }) // before penalty
      .mockResolvedValueOnce({ credits: 8 }); // after penalty
    mockPrisma.issue.count.mockResolvedValue(0);
    mockComputeFingerprint.mockReturnValue("fingerprint-abc");
    mockFindByFingerprint.mockResolvedValue({
      id: "issue-existing",
      title: "Existing issue",
    });
    // penalizeCredits uses $executeRawUnsafe
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    mockPrisma.creditTransaction.create.mockResolvedValue({});

    const result = await createIssue(
      { errorMessage: "Same error message", library: "lodash", errorCode: "E001" },
      "user-dup"
    );

    expect(result.isDuplicate).toBe(true);
    expect(result.creditsAwarded).toBe(-DUPLICATE_PENALTY);
  });
});

// ── C. Deferred Reward Flow ────────────────────────────────────────────────

describe("Deferred Reward Flow", () => {
  it("awards REPORT_DEFERRED_REWARD (+2) when another user interacts", async () => {
    const { claimReportReward } = await vi.importActual<typeof import("../services/reward")>("../services/reward");

    // Issue exists, not yet claimed
    mockPrisma.issue.findUnique.mockResolvedValue({
      reporterId: "user-reporter",
      rewardClaimed: false,
    });
    // Atomic UPDATE succeeds (first claim)
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    // awardCredits internals
    mockPrisma.user.update.mockResolvedValue({ credits: 7 });
    mockPrisma.creditTransaction.create.mockResolvedValue({});

    await claimReportReward("issue-1", "user-other");

    // Should award REPORT_DEFERRED_REWARD to reporter
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-reporter" },
        data: { credits: { increment: REPORT_DEFERRED_REWARD } },
      })
    );
  });

  it("does not double-pay on concurrent claims", async () => {
    const { claimReportReward } = await vi.importActual<typeof import("../services/reward")>("../services/reward");

    mockPrisma.issue.findUnique.mockResolvedValue({
      reporterId: "user-reporter",
      rewardClaimed: false,
    });
    // Atomic UPDATE returns 0 (another request already claimed)
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);

    await claimReportReward("issue-1", "user-other");

    // awardCredits should NOT be called
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("does not award deferred reward to the reporter themselves", async () => {
    const { claimReportReward } = await vi.importActual<typeof import("../services/reward")>("../services/reward");

    mockPrisma.issue.findUnique.mockResolvedValue({
      reporterId: "user-reporter",
      rewardClaimed: false,
    });

    await claimReportReward("issue-1", "user-reporter");

    // Should not even attempt the UPDATE
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("no-ops when reward already claimed", async () => {
    const { claimReportReward } = await vi.importActual<typeof import("../services/reward")>("../services/reward");

    mockPrisma.issue.findUnique.mockResolvedValue({
      reporterId: "user-reporter",
      rewardClaimed: true, // already claimed
    });

    await claimReportReward("issue-1", "user-other");

    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

// ── D. Patch Credits Flow ──────────────────────────────────────────────────

describe("Patch Credits Flow", () => {
  it("awards PATCH_REWARD (+5) on first patch submission", async () => {
    const { submitPatch } = await vi.importActual<typeof import("../services/patch")>("../services/patch");

    // issue.findUnique is called 3 times:
    // 1. submitPatch checks issue exists
    // 2. computeDerivedStatus loads issue with patches
    // 3. claimReportReward loads issue
    mockPrisma.issue.findUnique
      .mockResolvedValueOnce({ id: "issue-1" })
      .mockResolvedValueOnce({
        id: "issue-1",
        status: "open",
        accessCount: 0,
        patches: [],
      })
      .mockResolvedValueOnce({
        reporterId: "user-reporter",
        rewardClaimed: true,
      });
    mockPrisma.patch.findUnique.mockResolvedValue(null); // no existing patch
    mockPrisma.patch.create.mockResolvedValue({
      id: "patch-new",
      issueId: "issue-1",
      submitterId: "user-patcher",
      submitter: { id: "user-patcher" },
      issue: { title: "Some issue" },
    });
    // awardCredits
    mockPrisma.user.update.mockResolvedValue({ credits: 15 });
    mockPrisma.creditTransaction.create.mockResolvedValue({});

    const result = await submitPatch(
      "issue-1",
      "Fix by returning empty array fallback",
      [{ type: "instruction", text: "Add fallback" }],
      null,
      "user-patcher"
    );

    expect(result.creditsAwarded).toBe(PATCH_REWARD);
    expect(result.updated).toBe(false);
  });

  it("awards 0 credits on patch update (not another +5)", async () => {
    const { submitPatch } = await vi.importActual<typeof import("../services/patch")>("../services/patch");

    mockPrisma.issue.findUnique.mockResolvedValue({ id: "issue-1" });
    // Existing patch found
    mockPrisma.patch.findUnique.mockResolvedValue({
      id: "patch-existing",
      issueId: "issue-1",
      submitterId: "user-patcher",
    });
    mockPrisma.patch.update.mockResolvedValue({
      id: "patch-existing",
      issueId: "issue-1",
      submitterId: "user-patcher",
      submitter: { id: "user-patcher" },
      issue: { title: "Some issue" },
    });
    // getCredits
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ credits: 15 });

    const result = await submitPatch(
      "issue-1",
      "Updated explanation with more detail",
      [{ type: "instruction", text: "Updated fix" }],
      null,
      "user-patcher"
    );

    expect(result.creditsAwarded).toBe(0);
    expect(result.updated).toBe(true);
    // Should NOT have called awardCredits (user.update with increment)
    expect(mockPrisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: { credits: { increment: PATCH_REWARD } },
      })
    );
  });
});

// ── E. Verification Credit Distribution ────────────────────────────────────

describe("Verification Credit Distribution", () => {
  function setupVerificationMocks(outcome: string) {
    mockPrisma.patch.findUnique.mockResolvedValue({
      id: "patch-1",
      submitterId: "user-author",
      issueId: "issue-1",
      submitter: { id: "user-author" },
    });
    mockPrisma.verification.findUnique.mockResolvedValue(null);
    mockPrisma.verification.count.mockResolvedValue(0);
    mockPrisma.verification.create.mockResolvedValue({
      id: "ver-1",
      outcome,
      patchId: "patch-1",
      verifierId: "user-verifier",
      verifier: { id: "user-verifier" },
    });
    // awardCredits / penalizeCredits
    mockPrisma.user.update.mockResolvedValue({ credits: 10 });
    mockPrisma.creditTransaction.create.mockResolvedValue({});
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ credits: 10 });
    // computeDerivedStatus
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: "issue-1",
      status: "open",
      accessCount: 0,
      patches: [{ verifications: outcome === "fixed" ? [{ outcome: "fixed" }] : [] }],
    });
  }

  it("fixed: +2 verifier, +1 author", async () => {
    const { verify } = await vi.importActual<typeof import("../services/verification")>("../services/verification");
    setupVerificationMocks("fixed");

    const result = await verify("patch-1", "fixed", null, null, null, null, undefined, "user-verifier");

    expect(result.verifierCreditDelta).toBe(VERIFY_REWARD);
    expect(result.authorCreditDelta).toBe(PATCH_VERIFIED_FIXED_REWARD);

    // Verify the award calls happened
    // First call: verifier reward
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-verifier" },
        data: { credits: { increment: VERIFY_REWARD } },
      })
    );
    // Second call: author reward
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-author" },
        data: { credits: { increment: PATCH_VERIFIED_FIXED_REWARD } },
      })
    );
  });

  it("not_fixed: +2 verifier, -1 author", async () => {
    const { verify } = await vi.importActual<typeof import("../services/verification")>("../services/verification");
    setupVerificationMocks("not_fixed");

    const result = await verify("patch-1", "not_fixed", null, null, null, null, undefined, "user-verifier");

    expect(result.verifierCreditDelta).toBe(VERIFY_REWARD);
    expect(result.authorCreditDelta).toBe(-PATCH_VERIFIED_NOT_FIXED_PENALTY);

    // Verifier still gets rewarded
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-verifier" },
        data: { credits: { increment: VERIFY_REWARD } },
      })
    );
    // Author penalized via $executeRawUnsafe (GREATEST)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("GREATEST"),
      PATCH_VERIFIED_NOT_FIXED_PENALTY,
      "user-author"
    );
  });

  it("partial: +2 verifier, 0 author", async () => {
    const { verify } = await vi.importActual<typeof import("../services/verification")>("../services/verification");
    setupVerificationMocks("partial");

    const result = await verify("patch-1", "partial", null, null, null, null, undefined, "user-verifier");

    expect(result.verifierCreditDelta).toBe(VERIFY_REWARD);
    expect(result.authorCreditDelta).toBe(0);
  });
});

// ── F. Insufficient Credits Block ──────────────────────────────────────────

describe("Insufficient Credits Block", () => {
  it("search fails with 0 credits", async () => {
    const { deductCredits } = await vi.importActual<typeof import("../services/credits")>("../services/credits");

    // Atomic deduction returns 0 rows (insufficient)
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);

    await expect(
      deductCredits("user-broke", SEARCH_COST, "search_performed")
    ).rejects.toThrow("Insufficient credits");
  });

  it("report still works with 0 credits (report is free/rewarded)", async () => {
    const { createIssue } = await vi.importActual<typeof import("../services/issue")>("../services/issue");

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-broke",
      createdAt: new Date("2024-01-01"),
      credits: 0,
    });
    mockPrisma.issue.count.mockResolvedValue(0);
    mockComputeFingerprint.mockReturnValue(null);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockValidateContent.mockReturnValue({ valid: true });
    mockGenerateEmbedding.mockResolvedValue(null);
    mockPrisma.issue.create.mockResolvedValue({
      id: "issue-free",
      reporter: { id: "user-broke" },
    });
    mockPrisma.user.update.mockResolvedValue({ credits: 1 });
    mockPrisma.creditTransaction.create.mockResolvedValue({});

    // Should not throw — reports award credits, they don't cost
    const result = await createIssue(
      { errorMessage: "This is a real error message for testing" },
      "user-broke"
    );
    expect(result.issue.id).toBe("issue-free");
    expect(result.creditsAwarded).toBe(REPORT_IMMEDIATE_REWARD);
  });
});

// ── G. Report + Inline Patch Combined Credits ──────────────────────────────

describe("Report + Inline Patch Combined Credits", () => {
  it("awards REPORT_IMMEDIATE_REWARD + PATCH_REWARD on report with inline patch", async () => {
    const { createIssue } = await vi.importActual<typeof import("../services/issue")>("../services/issue");

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-reporter",
      createdAt: new Date("2024-01-01"),
      credits: 5,
    });
    mockPrisma.issue.count.mockResolvedValue(0);
    mockComputeFingerprint.mockReturnValue(null);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockValidateContent.mockReturnValue({ valid: true });
    mockGenerateEmbedding.mockResolvedValue(null);
    mockPrisma.issue.create.mockResolvedValue({
      id: "issue-with-patch",
      reporter: { id: "user-reporter" },
    });
    // awardCredits calls user.update (report + patch)
    mockPrisma.user.update.mockResolvedValue({ credits: 11 });
    mockPrisma.creditTransaction.create.mockResolvedValue({});
    // submitPatch calls issue.findUnique (1), then computeDerivedStatus (2), then claimReportReward (3)
    mockPrisma.issue.findUnique
      .mockResolvedValueOnce({ id: "issue-with-patch" }) // submitPatch
      .mockResolvedValueOnce({ // computeDerivedStatus
        id: "issue-with-patch",
        status: "open",
        accessCount: 0,
        patches: [],
      })
      .mockResolvedValueOnce({ // claimReportReward
        reporterId: "user-reporter",
        rewardClaimed: true,
      });
    mockPrisma.patch.findUnique.mockResolvedValue(null); // no existing
    mockPrisma.patch.create.mockResolvedValue({
      id: "patch-inline",
      issueId: "issue-with-patch",
      submitterId: "user-reporter",
      submitter: { id: "user-reporter" },
      issue: { title: "Issue with patch" },
    });

    const result = await createIssue(
      {
        errorMessage: "TypeError: Something went wrong with processing",
        patch: {
          explanation: "Fix by adding null check before processing",
          steps: [{ type: "instruction", text: "Add null check" }],
        },
      },
      "user-reporter"
    );

    // Total: REPORT_IMMEDIATE_REWARD (1) + PATCH_REWARD (5) = 6
    expect(result.creditsAwarded).toBe(REPORT_IMMEDIATE_REWARD + PATCH_REWARD);
    expect(result.inlinePatch).toBeDefined();
  });
});

// ── H. Duplicate Penalty via Embedding ─────────────────────────────────────

describe("Duplicate Penalty via Embedding", () => {
  it("penalizes DUPLICATE_PENALTY (-2) when embedding detects duplicate", async () => {
    const { createIssue } = await vi.importActual<typeof import("../services/issue")>("../services/issue");

    // First call: createIssue user lookup; second call: penalizeCredits balance read
    mockPrisma.user.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: "user-dup",
        createdAt: new Date("2024-01-01"),
        credits: 10,
      })
      .mockResolvedValueOnce({ credits: 8 }); // after penalty
    mockPrisma.issue.count.mockResolvedValue(0);
    mockComputeFingerprint.mockReturnValue(null);
    // No fingerprint match, but embedding finds duplicate
    mockCheckDuplicate.mockResolvedValue({
      isDuplicate: true,
      warning: "A very similar issue already exists",
      similarIssues: [{ id: "issue-existing", title: "Existing", similarity: 0.97 }],
    });
    // penalizeCredits
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    mockPrisma.creditTransaction.create.mockResolvedValue({});

    const result = await createIssue(
      { errorMessage: "Some very similar error message to existing" },
      "user-dup"
    );

    expect(result.isDuplicate).toBe(true);
    expect(result.creditsAwarded).toBe(-DUPLICATE_PENALTY);
    // penalizeCredits uses GREATEST to floor at 0
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("GREATEST"),
      DUPLICATE_PENALTY,
      "user-dup"
    );
  });
});
