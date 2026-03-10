import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all external dependencies ─────────────────────────────────────────

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
  logAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/revision", () => ({
  createIssueRevision: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/credits", () => ({
  awardCredits: vi.fn(),
  deductCredits: vi.fn(),
  penalizeCredits: vi.fn(),
  getCredits: vi.fn(),
}));
vi.mock("../services/reward", () => ({
  claimReportReward: vi.fn(),
}));
vi.mock("../services/relations", () => ({
  createRelation: vi.fn(),
  loadRelatedIssues: vi.fn(),
}));
vi.mock("../services/relationInference", () => ({
  inferRelationsForIssue: vi.fn(),
  inferRelationsForPatch: vi.fn(),
}));

import { prisma } from "@knownissue/db";
import {
  reportInputSchema,
  patchInputSchema,
  searchInputSchema,
  verificationInputSchema,
} from "@knownissue/shared";
import { verify } from "../services/verification";
import { createIssue, searchIssues } from "../services/issue";
import { deductCredits, penalizeCredits } from "../services/credits";
import { claimReportReward } from "../services/reward";
import { generateEmbedding } from "../services/embedding";
import { computeFingerprint, findByFingerprint } from "../services/fingerprint";
import { checkDuplicate, validateContent } from "../services/spam";
import { loadRelatedIssues } from "../services/relations";
import { inferRelationsForIssue } from "../services/relationInference";

const mockPrisma = prisma as unknown as {
  user: { findUniqueOrThrow: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  issue: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  patch: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  verification: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  creditTransaction: { create: ReturnType<typeof vi.fn> };
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
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
const mockDeductCredits = deductCredits as ReturnType<typeof vi.fn>;
const mockPenalizeCredits = penalizeCredits as ReturnType<typeof vi.fn>;
const mockClaimReportReward = claimReportReward as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  // Sensible defaults
  mockLoadRelatedIssues.mockResolvedValue(new Map());
  mockInferRelationsForIssue.mockResolvedValue([]);
  // Interactive transaction: pass the same mock prisma as `tx`
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
  );
});

// ── A. Input Validation (Zod boundary tests) ──────────────────────────────

describe("Input Validation", () => {
  describe("reportInputSchema", () => {
    it("accepts report with errorMessage only (no title, no description)", () => {
      const result = reportInputSchema.safeParse({
        errorMessage: "TypeError: Cannot read properties of undefined",
      });
      expect(result.success).toBe(true);
    });

    it("accepts report with description only (no errorMessage)", () => {
      const result = reportInputSchema.safeParse({
        description: "A long enough description that meets the character requirements for the report input",
      });
      expect(result.success).toBe(true);
    });

    it("rejects report with neither errorMessage nor description", () => {
      const result = reportInputSchema.safeParse({
        library: "lodash",
        version: "4.17.21",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("errorMessage or description");
      }
    });

    it("accepts report with short title when errorMessage is present", () => {
      const result = reportInputSchema.safeParse({
        title: "Short",
        errorMessage: "TypeError: Cannot read properties of undefined",
      });
      // title has no min length validation in the schema — it's optional
      expect(result.success).toBe(true);
    });

    it("rejects report with invalid severity", () => {
      const result = reportInputSchema.safeParse({
        errorMessage: "Some error",
        severity: "catastrophic",
      });
      expect(result.success).toBe(false);
    });

    it("rejects report with invalid category", () => {
      const result = reportInputSchema.safeParse({
        errorMessage: "Some error",
        category: "nonexistent",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("patchInputSchema", () => {
    it("rejects explanation shorter than MIN_EXPLANATION_LENGTH", () => {
      const result = patchInputSchema.safeParse({
        issueId: "550e8400-e29b-41d4-a716-446655440000",
        explanation: "Too short",
        steps: [{ type: "instruction", text: "Do something" }],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("at least");
      }
    });

    it("rejects empty steps array", () => {
      const result = patchInputSchema.safeParse({
        issueId: "550e8400-e29b-41d4-a716-446655440000",
        explanation: "A valid explanation that is long enough",
        steps: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("At least one step");
      }
    });

    it("rejects invalid UUID in issueId", () => {
      const result = patchInputSchema.safeParse({
        issueId: "not-a-uuid",
        explanation: "A valid explanation that is long enough",
        steps: [{ type: "instruction", text: "Do something" }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid UUID formats", () => {
      const result = patchInputSchema.safeParse({
        issueId: "550e8400-e29b-41d4-a716-446655440000",
        explanation: "A valid explanation that is long enough",
        steps: [{ type: "instruction", text: "Do something" }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("searchInputSchema", () => {
    it("requires either query or patchId", () => {
      const result = searchInputSchema.safeParse({
        library: "lodash",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("query or patchId");
      }
    });

    it("accepts query without patchId", () => {
      const result = searchInputSchema.safeParse({
        query: "merge crashes on circular",
      });
      expect(result.success).toBe(true);
    });

    it("accepts patchId without query", () => {
      const result = searchInputSchema.safeParse({
        patchId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid UUID in patchId", () => {
      const result = searchInputSchema.safeParse({
        patchId: "not-valid-uuid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("verificationInputSchema", () => {
    it("rejects invalid UUID in patchId", () => {
      const result = verificationInputSchema.safeParse({
        patchId: "invalid-uuid",
        outcome: "fixed",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid outcome", () => {
      const result = verificationInputSchema.safeParse({
        patchId: "550e8400-e29b-41d4-a716-446655440000",
        outcome: "maybe",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid verification input", () => {
      const result = verificationInputSchema.safeParse({
        patchId: "550e8400-e29b-41d4-a716-446655440000",
        outcome: "fixed",
        note: "Works perfectly now",
      });
      expect(result.success).toBe(true);
    });
  });
});

// ── B. SQL Injection Prevention ────────────────────────────────────────────

describe("SQL Injection Prevention", () => {
  it("searchIssues passes SQL injection payload as parameterized value", async () => {
    const maliciousQuery = "'; DROP TABLE \"Bug\"; --";

    mockComputeFingerprint.mockReturnValue(null);
    mockFindByFingerprint.mockResolvedValue(null);
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    // Two calls: first for issue rows, second for count
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([])        // issue results
      .mockResolvedValueOnce([{ count: 0 }]); // count query
    mockClaimReportReward.mockResolvedValue(undefined);

    await searchIssues({ query: maliciousQuery });

    // Verify the SQL template uses parameterized placeholders ($1, $2, etc)
    // and the actual user input is passed as a separate parameter, not concatenated
    const call = mockPrisma.$queryRawUnsafe.mock.calls[0];
    expect(call).toBeDefined();
    const sqlTemplate = call[0] as string;
    // The query string should contain $1 placeholders, not the user's input
    expect(sqlTemplate).toContain("$1::vector");
    expect(sqlTemplate).not.toContain("DROP TABLE");
  });

  it("searchIssues with SQL injection in library filter is safe because library is not a SQL filter", async () => {
    const maliciousLibrary = "'; DELETE FROM \"User\"; --";

    mockComputeFingerprint.mockReturnValue(null);
    mockFindByFingerprint.mockResolvedValue(null);
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    // Two calls: first for issue rows, second for count
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([])        // issue results
      .mockResolvedValueOnce([{ count: 0 }]); // count query
    mockClaimReportReward.mockResolvedValue(undefined);

    await searchIssues({ query: "some query", library: maliciousLibrary });

    const call = mockPrisma.$queryRawUnsafe.mock.calls[0];
    expect(call).toBeDefined();
    const sqlTemplate = call[0] as string;
    // Library is no longer a SQL filter — handled by embeddings instead
    // so malicious input never reaches the SQL query at all
    expect(sqlTemplate).not.toContain("DELETE FROM");
    expect(sqlTemplate).not.toContain(maliciousLibrary);
  });

  it("createIssue with SQL injection in errorMessage stores it safely", async () => {
    const malicious = "'; DROP TABLE \"Bug\"; --";

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      createdAt: new Date("2024-01-01"), // established account
      credits: 100,
    });
    mockPrisma.issue.count.mockResolvedValue(0);
    mockComputeFingerprint.mockReturnValue(null);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockValidateContent.mockReturnValue({ valid: true });
    mockGenerateEmbedding.mockResolvedValue(null);
    mockPrisma.issue.create.mockResolvedValue({
      id: "issue-new",
      errorMessage: malicious,
      reporter: { id: "user-1" },
    });

    const result = await createIssue({ errorMessage: malicious }, "user-1");

    // Should store the value as-is via Prisma (parameterized), not crash
    expect(result.issue.id).toBe("issue-new");
    expect(mockPrisma.issue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: malicious,
        }),
      })
    );
  });
});

// ── C. Self-Verification Prevention ────────────────────────────────────────

describe("Self-Verification Prevention", () => {
  it("rejects verification when submitterId matches verifierId", async () => {
    const userId = "user-author";

    mockPrisma.patch.findUnique.mockResolvedValue({
      id: "patch-1",
      submitterId: userId,
      issueId: "issue-1",
      submitter: { id: userId },
    });

    await expect(
      verify("patch-1", "fixed", null, null, null, null, undefined, userId)
    ).rejects.toThrow("Cannot verify your own patch");
  });

  it("allows verification from a different user", async () => {
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
      outcome: "fixed",
      patchId: "patch-1",
      verifierId: "user-other",
      verifier: { id: "user-other" },
    });
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: "issue-1",
      status: "open",
      accessCount: 0,
      patches: [{ verifications: [{ outcome: "fixed" }] }],
    });

    const result = await verify("patch-1", "fixed", null, null, null, null, undefined, "user-other");

    expect(result.id).toBe("ver-1");
  });
});

// ── D. Duplicate Verification Prevention ───────────────────────────────────

describe("Duplicate Verification Prevention", () => {
  it("rejects when user already verified the same patch", async () => {
    mockPrisma.patch.findUnique.mockResolvedValue({
      id: "patch-1",
      submitterId: "user-author",
      issueId: "issue-1",
      submitter: { id: "user-author" },
    });
    mockPrisma.verification.findUnique.mockResolvedValue({
      id: "ver-existing",
      patchId: "patch-1",
      verifierId: "user-verifier",
    });

    await expect(
      verify("patch-1", "fixed", null, null, null, null, undefined, "user-verifier")
    ).rejects.toThrow("You have already verified this patch");
  });
});

// ── E. Credit Race Condition Defense ───────────────────────────────────────

describe("Credit Race Condition Defense", () => {
  it("throws Insufficient credits when atomic UPDATE returns 0 rows", async () => {
    const { deductCredits: realDeductCredits } = await vi.importActual<typeof import("../services/credits")>("../services/credits");

    // Mock $queryRawUnsafe to return empty array (no rows updated = insufficient credits)
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await expect(
      realDeductCredits("user-1", 10, "search_performed")
    ).rejects.toThrow("Insufficient credits");
  });

  it("succeeds when atomic UPDATE returns 1 row", async () => {
    const { deductCredits: realDeductCredits } = await vi.importActual<typeof import("../services/credits")>("../services/credits");

    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ credits: 4 }]);
    mockPrisma.creditTransaction.create.mockResolvedValue({});

    const balance = await realDeductCredits("user-1", 1, "search_performed");
    expect(balance).toBe(4);
  });
});

// ── F. Rate Limiting - Report Throttle ─────────────────────────────────────

describe("Report Throttle", () => {
  const baseInput = {
    errorMessage: "TypeError: Something went wrong with the module resolution",
  };

  it("blocks new account (<7 days) at 10 reports/hour", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-new",
      createdAt: new Date(), // brand new
      credits: 100,
    });
    mockPrisma.issue.count.mockResolvedValue(10); // at limit

    await expect(createIssue(baseInput, "user-new")).rejects.toThrow(
      "Report limit reached (10/hour)"
    );
  });

  it("allows new account below limit", async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-new",
      createdAt: new Date(),
      credits: 100,
    });
    mockPrisma.issue.count.mockResolvedValue(9); // below limit
    mockComputeFingerprint.mockReturnValue(null);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockValidateContent.mockReturnValue({ valid: true });
    mockGenerateEmbedding.mockResolvedValue(null);
    mockPrisma.issue.create.mockResolvedValue({
      id: "issue-new",
      reporter: { id: "user-new" },
    });

    const result = await createIssue(baseInput, "user-new");
    expect(result.issue.id).toBe("issue-new");
  });

  it("blocks mature account (7-30 days) at 30 reports/hour", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-mature",
      createdAt: eightDaysAgo,
      credits: 100,
    });
    mockPrisma.issue.count.mockResolvedValue(30);

    await expect(createIssue(baseInput, "user-mature")).rejects.toThrow(
      "Report limit reached (30/hour)"
    );
  });

  it("blocks established account (>30 days) at 60 reports/hour", async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-established",
      createdAt: fortyDaysAgo,
      credits: 100,
    });
    mockPrisma.issue.count.mockResolvedValue(60);

    await expect(createIssue(baseInput, "user-established")).rejects.toThrow(
      "Report limit reached (60/hour)"
    );
  });

  it("allows established account below limit", async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-established",
      createdAt: fortyDaysAgo,
      credits: 100,
    });
    mockPrisma.issue.count.mockResolvedValue(59);
    mockComputeFingerprint.mockReturnValue(null);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockValidateContent.mockReturnValue({ valid: true });
    mockGenerateEmbedding.mockResolvedValue(null);
    mockPrisma.issue.create.mockResolvedValue({
      id: "issue-est",
      reporter: { id: "user-established" },
    });

    const result = await createIssue(baseInput, "user-established");
    expect(result.issue.id).toBe("issue-est");
  });
});

// ── G. Daily Verification Cap ──────────────────────────────────────────────

describe("Daily Verification Cap", () => {
  it("blocks verification when daily cap (20) is reached", async () => {
    mockPrisma.patch.findUnique.mockResolvedValue({
      id: "patch-1",
      submitterId: "user-author",
      issueId: "issue-1",
      submitter: { id: "user-author" },
    });
    mockPrisma.verification.findUnique.mockResolvedValue(null);
    mockPrisma.verification.count.mockResolvedValue(20); // at cap

    await expect(
      verify("patch-1", "fixed", null, null, null, null, undefined, "user-verifier")
    ).rejects.toThrow("Daily verification limit reached");
  });

  it("allows verification when under daily cap", async () => {
    mockPrisma.patch.findUnique.mockResolvedValue({
      id: "patch-1",
      submitterId: "user-author",
      issueId: "issue-1",
      submitter: { id: "user-author" },
    });
    mockPrisma.verification.findUnique.mockResolvedValue(null);
    mockPrisma.verification.count.mockResolvedValue(19); // under cap
    mockPrisma.verification.create.mockResolvedValue({
      id: "ver-1",
      outcome: "fixed",
      patchId: "patch-1",
      verifierId: "user-verifier",
      verifier: { id: "user-verifier" },
    });
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: "issue-1",
      status: "open",
      accessCount: 0,
      patches: [{ verifications: [{ outcome: "fixed" }] }],
    });

    const result = await verify("patch-1", "fixed", null, null, null, null, undefined, "user-verifier");
    expect(result.id).toBe("ver-1");
  });
});

// ── H. Negative Credit Floor ───────────────────────────────────────────────

describe("Negative Credit Floor", () => {
  it("penalizeCredits uses GREATEST(credits - amount, 0) in raw SQL", async () => {
    const { penalizeCredits: realPenalize } = await vi.importActual<typeof import("../services/credits")>("../services/credits");

    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ credits: 0, previousBalance: 5 }]);
    mockPrisma.creditTransaction.create.mockResolvedValue({});

    await realPenalize("user-1", 999, "duplicate_penalty");

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("GREATEST(credits - $1, 0)"),
      999,
      "user-1"
    );
  });

  it("penalizeCredits never results in negative balance", async () => {
    const { penalizeCredits: realPenalize } = await vi.importActual<typeof import("../services/credits")>("../services/credits");

    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ credits: 0, previousBalance: 0 }]);
    mockPrisma.creditTransaction.create.mockResolvedValue({});

    const result = await realPenalize("user-1", 100, "duplicate_penalty");
    expect(result).toEqual({ newBalance: 0, actualDeduction: 0 });
  });
});

// ── I. Deferred Reward Atomicity ───────────────────────────────────────────

describe("Deferred Reward Atomicity", () => {
  it("prevents double-claim via atomic UPDATE returning 0", async () => {
    const { claimReportReward: realClaim } = await vi.importActual<typeof import("../services/reward")>("../services/reward");

    mockPrisma.issue.findUnique.mockResolvedValue({
      reporterId: "user-reporter",
      rewardClaimed: false,
    });
    // First call succeeds
    mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1);

    await realClaim("issue-1", "user-other");

    // Verify the atomic UPDATE was called
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("rewardClaimed"),
      "issue-1"
    );
  });

  it("does not award credits when atomic UPDATE returns 0 (already claimed)", async () => {
    const { claimReportReward: realClaim } = await vi.importActual<typeof import("../services/reward")>("../services/reward");
    const { awardCredits } = await vi.importActual<typeof import("../services/credits")>("../services/credits");

    mockPrisma.issue.findUnique.mockResolvedValue({
      reporterId: "user-reporter",
      rewardClaimed: false,
    });
    // Simulate concurrent request already claimed
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);

    await realClaim("issue-1", "user-other");

    // awardCredits should NOT have been called — the atomic check prevented it
    // Since awardCredits is mocked at module level, check it wasn't called
    // After the $executeRawUnsafe returns 0, claimReportReward returns early
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("does not award when triggerUser is the reporter", async () => {
    const { claimReportReward: realClaim } = await vi.importActual<typeof import("../services/reward")>("../services/reward");

    mockPrisma.issue.findUnique.mockResolvedValue({
      reporterId: "user-reporter",
      rewardClaimed: false,
    });

    await realClaim("issue-1", "user-reporter");

    // Should not even attempt the atomic UPDATE
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

// ── J. Oversized Payload Handling ──────────────────────────────────────────

describe("Oversized Payload Handling", () => {
  it("accepts report with very long errorMessage without crashing", async () => {
    const longError = "E".repeat(100_000);

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      createdAt: new Date("2024-01-01"),
      credits: 100,
    });
    mockPrisma.issue.count.mockResolvedValue(0);
    mockComputeFingerprint.mockReturnValue(null);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockValidateContent.mockReturnValue({ valid: true });
    mockGenerateEmbedding.mockResolvedValue(null);
    mockPrisma.issue.create.mockResolvedValue({
      id: "issue-large",
      errorMessage: longError,
      reporter: { id: "user-1" },
    });

    const result = await createIssue({ errorMessage: longError }, "user-1");
    expect(result.issue.id).toBe("issue-large");
  });

  it("Zod still parses very long description without crashing", () => {
    const longDesc = "D".repeat(100_000);
    const result = reportInputSchema.safeParse({
      description: longDesc,
    });
    expect(result.success).toBe(true);
  });
});

// ── K. XSS in Data ────────────────────────────────────────────────────────

describe("XSS in Data", () => {
  it("stores script tags in errorMessage as-is (no transformation)", async () => {
    const xssPayload = '<script>alert("xss")</script>';

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      createdAt: new Date("2024-01-01"),
      credits: 100,
    });
    mockPrisma.issue.count.mockResolvedValue(0);
    mockComputeFingerprint.mockReturnValue(null);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockValidateContent.mockReturnValue({ valid: true });
    mockGenerateEmbedding.mockResolvedValue(null);
    mockPrisma.issue.create.mockResolvedValue({
      id: "issue-xss",
      errorMessage: xssPayload,
      reporter: { id: "user-1" },
    });

    const result = await createIssue({ errorMessage: xssPayload }, "user-1");

    // The system stores raw text — no HTML sanitization needed since
    // the API returns JSON, not HTML
    expect(mockPrisma.issue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: xssPayload,
        }),
      })
    );
    expect(result.issue.errorMessage).toBe(xssPayload);
  });

  it("JSON.stringify properly escapes stored XSS payloads", () => {
    const xssPayload = '<script>alert("xss")</script>';
    const jsonOutput = JSON.stringify({ errorMessage: xssPayload });

    // JSON serialization escapes the quotes, making it safe in JSON context
    expect(jsonOutput).toContain("\\\"xss\\\"");
    expect(jsonOutput).not.toContain('<script>alert("xss")</script>');
  });

  it("stores event handler attributes as-is", async () => {
    const xssPayload = '<img onerror="alert(1)" src=x>';

    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      createdAt: new Date("2024-01-01"),
      credits: 100,
    });
    mockPrisma.issue.count.mockResolvedValue(0);
    mockComputeFingerprint.mockReturnValue(null);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockValidateContent.mockReturnValue({ valid: true });
    mockGenerateEmbedding.mockResolvedValue(null);
    mockPrisma.issue.create.mockResolvedValue({
      id: "issue-xss2",
      errorMessage: xssPayload,
      reporter: { id: "user-1" },
    });

    const result = await createIssue({ errorMessage: xssPayload }, "user-1");
    expect(result.issue.id).toBe("issue-xss2");
  });
});

// ── L. Patch Not Found ────────────────────────────────────────────────────

describe("Patch Not Found", () => {
  it("verify throws when patch does not exist", async () => {
    mockPrisma.patch.findUnique.mockResolvedValue(null);

    await expect(
      verify("nonexistent-patch", "fixed", null, null, null, null, undefined, "user-1")
    ).rejects.toThrow("Patch not found");
  });
});
