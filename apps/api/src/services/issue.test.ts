import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
  REPORT_IMMEDIATE_REWARD,
  DUPLICATE_PENALTY,
  ACCESS_COUNT_THRESHOLD,
  PATCHED_FIXED_COUNT,
  CLOSED_FIXED_COUNT,
  REPORT_THROTTLE_NEW,
  REPORT_THROTTLE_MATURE,
  REPORT_THROTTLE_ESTABLISHED,
  ACCOUNT_AGE_MATURE,
  ACCOUNT_AGE_ESTABLISHED,
  RELATION_DISPLAY_CONFIDENCE_MIN,
  RELATION_MAX_DISPLAYED_PER_ISSUE,
} from "@knownissue/shared";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUniqueOrThrow: vi.fn(),
    findUnique: vi.fn(),
  },
  issue: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  patch: {
    findMany: vi.fn(),
  },
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
};

vi.mock("@knownissue/db", () => ({ prisma: mockPrisma }));
vi.mock("./embedding", () => ({ generateEmbedding: vi.fn() }));
vi.mock("./fingerprint", () => ({
  computeFingerprint: vi.fn(),
  findByFingerprint: vi.fn(),
}));
vi.mock("./spam", () => ({
  checkDuplicate: vi.fn(),
  validateContent: vi.fn(),
}));
vi.mock("./audit", () => ({ logAudit: vi.fn() }));
vi.mock("./revision", () => ({ createIssueRevision: vi.fn() }));
vi.mock("./credits", () => ({
  awardCredits: vi.fn(),
  penalizeCredits: vi.fn(),
}));
vi.mock("./patch", () => ({ submitPatch: vi.fn() }));
vi.mock("./reward", () => ({ claimReportReward: vi.fn() }));
vi.mock("./relations", () => ({
  createRelation: vi.fn(),
  loadRelatedIssues: vi.fn(),
}));
vi.mock("./relationInference", () => ({ inferRelationsForIssue: vi.fn() }));

// Import after mocks
const { searchIssues, getIssueById, createIssue, listIssues, computeDerivedStatus, getUserIssues } =
  await import("./issue");
const { generateEmbedding } = await import("./embedding") as { generateEmbedding: Mock };
const { computeFingerprint, findByFingerprint } = await import("./fingerprint") as {
  computeFingerprint: Mock;
  findByFingerprint: Mock;
};
const { checkDuplicate, validateContent } = await import("./spam") as {
  checkDuplicate: Mock;
  validateContent: Mock;
};
const { logAudit } = await import("./audit") as { logAudit: Mock };
const { createIssueRevision } = await import("./revision") as { createIssueRevision: Mock };
const { awardCredits, penalizeCredits } = await import("./credits") as {
  awardCredits: Mock;
  penalizeCredits: Mock;
};
const patchService = await import("./patch") as { submitPatch: Mock };
const { claimReportReward } = await import("./reward") as { claimReportReward: Mock };
const { createRelation, loadRelatedIssues } = await import("./relations") as {
  createRelation: Mock;
  loadRelatedIssues: Mock;
};
const { inferRelationsForIssue } = await import("./relationInference") as {
  inferRelationsForIssue: Mock;
};

// ── Helpers ─────────────────────────────────────────────────────────────

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: "issue-1",
    title: "Test issue",
    description: "A test issue description",
    library: "lodash",
    version: "4.17.21",
    ecosystem: "npm",
    severity: "medium",
    status: "open",
    tags: [],
    errorMessage: "TypeError: cannot read property",
    errorCode: null,
    fingerprint: null,
    contextLibraries: [],
    runtime: null,
    platform: null,
    category: null,
    accessCount: 0,
    searchHitCount: 0,
    reporterId: "user-1",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makePatchWithVerifications(overrides: Record<string, unknown> = {}, verifications: { outcome: string }[] = []) {
  return {
    id: "patch-1",
    explanation: "Fix the bug",
    steps: [{ type: "instruction", text: "Do this" }],
    versionConstraint: null,
    submitter: { id: "user-2", username: "fixer" },
    createdAt: new Date("2024-01-02"),
    issueId: "issue-1",
    verifications,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  loadRelatedIssues.mockResolvedValue(new Map());
  inferRelationsForIssue.mockResolvedValue(undefined);
});

// ── computeDerivedStatus ────────────────────────────────────────────────

describe("computeDerivedStatus", () => {
  it("returns early if issue not found", async () => {
    mockPrisma.issue.findUnique.mockResolvedValue(null);
    await computeDerivedStatus("missing-id");
    expect(mockPrisma.issue.update).not.toHaveBeenCalled();
  });

  it("sets status to 'closed' when fixedCount >= CLOSED_FIXED_COUNT", async () => {
    const verifications = Array.from({ length: CLOSED_FIXED_COUNT }, () => ({ outcome: "fixed" }));
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: "issue-1",
      status: "open",
      accessCount: 0,
      patches: [{ verifications }],
    });

    await computeDerivedStatus("issue-1");

    expect(mockPrisma.issue.update).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: { status: "closed" },
    });
  });

  it("sets status to 'patched' when fixedCount >= PATCHED_FIXED_COUNT but < CLOSED_FIXED_COUNT", async () => {
    const verifications = Array.from({ length: PATCHED_FIXED_COUNT }, () => ({ outcome: "fixed" }));
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: "issue-1",
      status: "open",
      accessCount: 0,
      patches: [{ verifications }],
    });

    await computeDerivedStatus("issue-1");

    expect(mockPrisma.issue.update).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: { status: "patched" },
    });
  });

  it("sets status to 'confirmed' when accessCount >= ACCESS_COUNT_THRESHOLD", async () => {
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: "issue-1",
      status: "open",
      accessCount: ACCESS_COUNT_THRESHOLD,
      patches: [{ verifications: [] }],
    });

    await computeDerivedStatus("issue-1");

    expect(mockPrisma.issue.update).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: { status: "confirmed" },
    });
  });

  it("does not update when status is unchanged", async () => {
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: "issue-1",
      status: "open",
      accessCount: 0,
      patches: [{ verifications: [] }],
    });

    await computeDerivedStatus("issue-1");

    expect(mockPrisma.issue.update).not.toHaveBeenCalled();
  });

  it("'closed' takes precedence over 'confirmed' when both thresholds met", async () => {
    const verifications = Array.from({ length: CLOSED_FIXED_COUNT }, () => ({ outcome: "fixed" }));
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: "issue-1",
      status: "open",
      accessCount: ACCESS_COUNT_THRESHOLD + 5,
      patches: [{ verifications }],
    });

    await computeDerivedStatus("issue-1");

    expect(mockPrisma.issue.update).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: { status: "closed" },
    });
  });

  it("counts fixed verifications across multiple patches", async () => {
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: "issue-1",
      status: "open",
      accessCount: 0,
      patches: [
        { verifications: [{ outcome: "fixed" }] },
        { verifications: [{ outcome: "fixed" }, { outcome: "fixed" }] },
      ],
    });

    await computeDerivedStatus("issue-1");

    expect(mockPrisma.issue.update).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      data: { status: "closed" },
    });
  });
});

// ── searchIssues ────────────────────────────────────────────────────────

describe("searchIssues", () => {
  describe("Tier 1: fingerprint match via errorCode + library", () => {
    it("returns issue immediately when fingerprint match found", async () => {
      const issue = makeIssue({ patches: [makePatchWithVerifications({}, [{ outcome: "fixed" }])] });
      computeFingerprint.mockReturnValue("fp-hash");
      findByFingerprint.mockResolvedValue(issue);

      const result = await searchIssues({ query: "test", errorCode: "ERR_1", library: "lodash" });

      expect(result._meta.matchTier).toBe(1);
      expect(result._meta.confidence).toBe(1.0);
      expect(result.issues).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("falls through if fingerprint is null", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue(null);
      mockPrisma.issue.findMany.mockResolvedValue([]);
      mockPrisma.issue.count.mockResolvedValue(0);

      const result = await searchIssues({ query: "test", errorCode: "ERR_1", library: "lodash" });

      expect(result._meta.matchTier).toBe(3);
    });

    it("falls through if no issue found for fingerprint", async () => {
      computeFingerprint.mockReturnValue("fp-hash");
      findByFingerprint.mockResolvedValue(null);
      generateEmbedding.mockResolvedValue(null);
      mockPrisma.issue.findMany.mockResolvedValue([]);
      mockPrisma.issue.count.mockResolvedValue(0);

      const result = await searchIssues({ query: "test", errorCode: "ERR_1", library: "lodash" });

      expect(result._meta.matchTier).toBe(3);
    });
  });

  describe("Tier 2: fingerprint match via normalized errorMessage + library", () => {
    it("returns issue with tier 2 confidence", async () => {
      const issue = makeIssue({ patches: [makePatchWithVerifications()] });
      // No errorCode, so Tier 1 block is skipped entirely (no computeFingerprint call).
      // Tier 2 calls computeFingerprint(library, null, query) — only one call.
      computeFingerprint.mockReturnValueOnce("fp-msg-hash");
      findByFingerprint.mockResolvedValue(issue);

      const result = await searchIssues({ query: "some error", library: "lodash" });

      expect(result._meta.matchTier).toBe(2);
      expect(result._meta.confidence).toBe(0.95);
    });
  });

  describe("Tier 3: embedding search", () => {
    it("returns empty when query is undefined and no fingerprint matches", async () => {
      computeFingerprint.mockReturnValue(null);

      const result = await searchIssues({} as { query: string });

      expect(result.issues).toHaveLength(0);
      expect(result._meta.matchTier).toBeNull();
    });

    it("performs vector search when embedding is available", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([makeIssue({ similarity: 0.9 })])
        .mockResolvedValueOnce([{ count: 1 }]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
      mockPrisma.patch.findMany.mockResolvedValue([]);
      claimReportReward.mockResolvedValue(undefined);

      const result = await searchIssues({ query: "error", library: "lodash" }, "user-1");

      expect(result._meta.matchTier).toBe(3);
      expect(result.issues).toHaveLength(1);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalled();
    });

    it("increments searchHitCount on returned issues", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue([0.1, 0.2]);
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([makeIssue({ id: "i1" }), makeIssue({ id: "i2" })])
        .mockResolvedValueOnce([{ count: 2 }]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(2);
      mockPrisma.patch.findMany.mockResolvedValue([]);
      claimReportReward.mockResolvedValue(undefined);

      await searchIssues({ query: "error" }, "user-1");

      // First $executeRawUnsafe call is for searchHitCount update
      const firstCall = mockPrisma.$executeRawUnsafe.mock.calls[0];
      expect(firstCall[0]).toContain('UPDATE "Bug" SET "searchHitCount"');
      expect(firstCall[1]).toEqual(["i1", "i2"]);
    });

    it("triggers deferred report rewards when userId is provided", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue([0.1]);
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([makeIssue({ id: "i1" })])
        .mockResolvedValueOnce([{ count: 1 }]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
      mockPrisma.patch.findMany.mockResolvedValue([]);
      claimReportReward.mockResolvedValue(undefined);

      await searchIssues({ query: "error" }, "user-1");

      expect(claimReportReward).toHaveBeenCalledWith("i1", "user-1");
    });

    it("does not trigger rewards when no userId", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue([0.1]);
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([makeIssue({ id: "i1" })])
        .mockResolvedValueOnce([{ count: 1 }]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
      mockPrisma.patch.findMany.mockResolvedValue([]);

      await searchIssues({ query: "error" });

      expect(claimReportReward).not.toHaveBeenCalled();
    });

    it("adds version, contextLibrary, and library filters to vector query", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue([0.5]);
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]);

      await searchIssues({ query: "error", library: "react", version: "18.2.0", contextLibrary: "webpack" });

      const sql = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('"version" = $4');
      expect(sql).toContain('ANY("contextLibraries")');
      expect(sql).toContain('LOWER("library")');
    });

    it("loads patches with verification summary for vector results", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue([0.1]);
      const rawIssue = makeIssue({ id: "i1" });
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([rawIssue])
        .mockResolvedValueOnce([{ count: 1 }]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
      claimReportReward.mockResolvedValue(undefined);
      mockPrisma.patch.findMany.mockResolvedValue([
        makePatchWithVerifications({ issueId: "i1" }, [{ outcome: "fixed" }, { outcome: "not_fixed" }]),
      ]);

      const result = await searchIssues({ query: "error" }, "user-1");

      expect(result.issues[0].patches[0].verificationSummary).toEqual({
        fixed: 1,
        not_fixed: 1,
        partial: 0,
        total: 2,
      });
    });

    it("returns no-results _next_actions when empty", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue([0.1]);
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(0);

      const result = await searchIssues({ query: "nonexistent" });

      expect(result._next_actions[0]).toContain("No known issues found");
    });
  });

  describe("Fallback: text search", () => {
    it("falls back to Prisma text search when embedding is null", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue(null);
      const issue = makeIssue({
        reporter: { id: "user-1" },
        patches: [makePatchWithVerifications()],
        _count: { patches: 1 },
      });
      mockPrisma.issue.findMany.mockResolvedValue([issue]);
      mockPrisma.issue.count.mockResolvedValue(1);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
      claimReportReward.mockResolvedValue(undefined);

      const result = await searchIssues({ query: "TypeError" }, "user-1");

      expect(result._meta.matchTier).toBe(3);
      expect(result.issues).toHaveLength(1);
      expect(mockPrisma.issue.findMany).toHaveBeenCalled();
    });

    it("applies library filter but not contextLibrary in text search", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue(null);
      mockPrisma.issue.findMany.mockResolvedValue([]);
      mockPrisma.issue.count.mockResolvedValue(0);

      await searchIssues({ query: "error", library: "react", contextLibrary: "webpack" });

      const call = mockPrisma.issue.findMany.mock.calls[0][0];
      expect(call.where.library).toEqual({ equals: "react", mode: "insensitive" });
      expect(call.where.contextLibraries).toBeUndefined();
    });

    it("loads related issues for text search results", async () => {
      computeFingerprint.mockReturnValue(null);
      generateEmbedding.mockResolvedValue(null);
      mockPrisma.issue.findMany.mockResolvedValue([
        makeIssue({ patches: [makePatchWithVerifications()] }),
      ]);
      mockPrisma.issue.count.mockResolvedValue(1);
      mockPrisma.$executeRawUnsafe.mockResolvedValue(1);

      await searchIssues({ query: "error" });

      expect(loadRelatedIssues).toHaveBeenCalledWith(
        ["issue-1"],
        { minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN, maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE },
      );
    });
  });
});

// ── getIssueById ────────────────────────────────────────────────────────

describe("getIssueById", () => {
  it("returns null when issue not found", async () => {
    mockPrisma.issue.findUnique.mockResolvedValue(null);
    const result = await getIssueById("missing-id");
    expect(result).toBeNull();
  });

  it("returns issue with relatedIssues", async () => {
    const issue = makeIssue({ reporter: {}, patches: [] });
    mockPrisma.issue.findUnique.mockResolvedValue(issue);
    const relatedMap = new Map([["issue-1", [{ issueId: "issue-2", relationType: "same_root_cause" }]]]);
    loadRelatedIssues.mockResolvedValue(relatedMap);

    const result = await getIssueById("issue-1");

    expect(result!.relatedIssues).toHaveLength(1);
    expect(loadRelatedIssues).toHaveBeenCalledWith(
      ["issue-1"],
      { minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN, maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE },
    );
  });

  it("returns empty relatedIssues when none found", async () => {
    const issue = makeIssue({ reporter: {}, patches: [] });
    mockPrisma.issue.findUnique.mockResolvedValue(issue);

    const result = await getIssueById("issue-1");

    expect(result!.relatedIssues).toEqual([]);
  });
});

// ── createIssue ─────────────────────────────────────────────────────────

describe("createIssue", () => {
  const validInput = {
    errorMessage: "TypeError: cannot read property of undefined",
    library: "lodash",
    version: "4.17.21",
    severity: "medium" as const,
    tags: [],
  };

  beforeEach(() => {
    validateContent.mockReturnValue({ valid: true });
    computeFingerprint.mockReturnValue(null);
    findByFingerprint.mockResolvedValue(null);
    checkDuplicate.mockResolvedValue({ isDuplicate: false });
    generateEmbedding.mockResolvedValue([0.1, 0.2]);
    mockPrisma.issue.create.mockResolvedValue(makeIssue({ reporter: { id: "user-1" } }));
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    awardCredits.mockResolvedValue(6);
    logAudit.mockResolvedValue(undefined);
    createIssueRevision.mockResolvedValue(undefined);
  });

  describe("report throttle", () => {
    it("allows new accounts up to REPORT_THROTTLE_NEW reports/hour", async () => {
      const newUser = { id: "user-1", createdAt: new Date() }; // just created
      mockPrisma.user.findUniqueOrThrow = vi.fn().mockResolvedValue(newUser);
      mockPrisma.issue.count.mockResolvedValue(REPORT_THROTTLE_NEW - 1);

      await expect(createIssue(validInput, "user-1")).resolves.toBeDefined();
    });

    it("throws for new accounts exceeding throttle", async () => {
      const newUser = { id: "user-1", createdAt: new Date() };
      mockPrisma.user.findUniqueOrThrow = vi.fn().mockResolvedValue(newUser);
      mockPrisma.issue.count.mockResolvedValue(REPORT_THROTTLE_NEW);

      await expect(createIssue(validInput, "user-1")).rejects.toThrow(
        `Report limit reached (${REPORT_THROTTLE_NEW}/hour)`
      );
    });

    it("allows mature accounts higher throttle", async () => {
      const matureUser = {
        id: "user-1",
        createdAt: new Date(Date.now() - ACCOUNT_AGE_MATURE - 1000),
      };
      mockPrisma.user.findUniqueOrThrow = vi.fn().mockResolvedValue(matureUser);
      mockPrisma.issue.count.mockResolvedValue(REPORT_THROTTLE_MATURE - 1);

      await expect(createIssue(validInput, "user-1")).resolves.toBeDefined();
    });

    it("allows established accounts highest throttle", async () => {
      const oldUser = {
        id: "user-1",
        createdAt: new Date(Date.now() - ACCOUNT_AGE_ESTABLISHED - 1000),
      };
      mockPrisma.user.findUniqueOrThrow = vi.fn().mockResolvedValue(oldUser);
      mockPrisma.issue.count.mockResolvedValue(REPORT_THROTTLE_ESTABLISHED - 1);

      await expect(createIssue(validInput, "user-1")).resolves.toBeDefined();
    });
  });

  describe("content validation", () => {
    it("throws when content is invalid", async () => {
      mockPrisma.user.findUniqueOrThrow = vi.fn().mockResolvedValue({
        id: "user-1",
        createdAt: new Date(Date.now() - ACCOUNT_AGE_ESTABLISHED - 1000),
      });
      mockPrisma.issue.count.mockResolvedValue(0);
      validateContent.mockReturnValue({ valid: false, reason: "Content too short" });

      await expect(createIssue(validInput, "user-1")).rejects.toThrow("Content too short");
    });
  });

  describe("duplicate detection", () => {
    beforeEach(() => {
      mockPrisma.user.findUniqueOrThrow = vi.fn().mockResolvedValue({
        id: "user-1",
        createdAt: new Date(Date.now() - ACCOUNT_AGE_ESTABLISHED - 1000),
      });
      mockPrisma.issue.count.mockResolvedValue(0);
    });

    it("returns duplicate result on fingerprint match", async () => {
      const existing = makeIssue({ id: "existing-1" });
      computeFingerprint.mockReturnValue("fp-hash");
      findByFingerprint.mockResolvedValue(existing);
      penalizeCredits.mockResolvedValue({ newBalance: 0, actualDeduction: 2 });

      const result = await createIssue(validInput, "user-1");

      expect(result.isDuplicate).toBe(true);
      expect(result.creditsAwarded).toBe(-2);
      expect(penalizeCredits).toHaveBeenCalledWith(
        "user-1",
        DUPLICATE_PENALTY,
        "duplicate_penalty",
        { issueId: "existing-1" },
      );
    });

    it("returns duplicate result on embedding similarity match", async () => {
      computeFingerprint.mockReturnValue(null);
      checkDuplicate.mockResolvedValue({
        isDuplicate: true,
        warning: "Very similar issue",
        similarIssues: [{ id: "similar-1", title: "Similar", similarity: 0.97 }],
      });
      penalizeCredits.mockResolvedValue({ newBalance: 0, actualDeduction: 2 });

      const result = await createIssue(validInput, "user-1");

      expect(result.isDuplicate).toBe(true);
      expect(result.issue).toEqual({ id: "similar-1", title: "Similar" });
    });

    it("handles embedding duplicate with no top match", async () => {
      computeFingerprint.mockReturnValue(null);
      checkDuplicate.mockResolvedValue({
        isDuplicate: true,
        warning: "Duplicate",
        similarIssues: [],
      });
      penalizeCredits.mockResolvedValue({ newBalance: 0, actualDeduction: 2 });

      const result = await createIssue(validInput, "user-1");

      expect(result.isDuplicate).toBe(true);
      expect(result.issue).toBeNull();
      expect(result._next_actions).toContainEqual("Call search to find the existing issue");
    });
  });

  describe("successful creation", () => {
    beforeEach(() => {
      mockPrisma.user.findUniqueOrThrow = vi.fn().mockResolvedValue({
        id: "user-1",
        createdAt: new Date(Date.now() - ACCOUNT_AGE_ESTABLISHED - 1000),
      });
      mockPrisma.issue.count.mockResolvedValue(0);
    });

    it("creates issue and stores embedding", async () => {
      const result = await createIssue(validInput, "user-1");

      expect(mockPrisma.issue.create).toHaveBeenCalled();
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'UPDATE "Bug" SET embedding = $1::vector WHERE id = $2',
        expect.any(String),
        "issue-1",
      );
      expect(result.creditsAwarded).toBe(REPORT_IMMEDIATE_REWARD);
    });

    it("awards REPORT_IMMEDIATE_REWARD credits", async () => {
      await createIssue(validInput, "user-1");

      expect(awardCredits).toHaveBeenCalledWith(
        "user-1",
        REPORT_IMMEDIATE_REWARD,
        "issue_reported",
        { issueId: "issue-1" },
      );
    });

    it("creates audit log and revision", async () => {
      await createIssue(validInput, "user-1");

      expect(createIssueRevision).toHaveBeenCalledWith("issue-1", "create", "user-1");
      expect(logAudit).toHaveBeenCalledWith({
        action: "create",
        entityType: "issue",
        entityId: "issue-1",
        actorId: "user-1",
      });
    });

    it("skips embedding store when embedding is null", async () => {
      generateEmbedding.mockResolvedValue(null);

      await createIssue(validInput, "user-1");

      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("handles inline patch", async () => {
      patchService.submitPatch.mockResolvedValue({
        id: "patch-1",
        creditsAwarded: 5,
      });

      const inputWithPatch = {
        ...validInput,
        patch: {
          explanation: "Fix by updating the dependency",
          steps: [{ type: "instruction" as const, text: "Update lodash" }],
        },
      };

      const result = await createIssue(inputWithPatch, "user-1");

      expect(patchService.submitPatch).toHaveBeenCalledWith(
        "issue-1",
        "Fix by updating the dependency",
        [{ type: "instruction", text: "Update lodash" }],
        null,
        "user-1",
      );
      expect(result.creditsAwarded).toBe(REPORT_IMMEDIATE_REWARD + 5);
      expect(result.inlinePatch).toBeDefined();
    });

    it("returns issue with warning when inline patch fails", async () => {
      patchService.submitPatch.mockRejectedValue(new Error("Patch submission failed"));

      const inputWithPatch = {
        ...validInput,
        patch: {
          explanation: "Fix by updating the dependency",
          steps: [{ type: "instruction" as const, text: "Update lodash" }],
        },
      };

      const result = await createIssue(inputWithPatch, "user-1");

      expect(result.issue).toBeDefined();
      expect(result.creditsAwarded).toBe(REPORT_IMMEDIATE_REWARD);
      expect(result.inlinePatch).toEqual({
        error: "Patch submission failed",
        creditsAwarded: 0,
      });
    });

    it("handles relatedTo", async () => {
      createRelation.mockResolvedValue(true);

      const relatedIssueId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
      const inputWithRelation = {
        ...validInput,
        relatedTo: {
          issueId: relatedIssueId,
          type: "same_root_cause" as const,
          note: "Same root cause",
        },
      };

      await createIssue(inputWithRelation, "user-1");

      expect(createRelation).toHaveBeenCalledWith({
        sourceIssueId: "issue-1",
        targetIssueId: relatedIssueId,
        type: "same_root_cause",
        source: "agent",
        confidence: 1.0,
        metadata: { note: "Same root cause" },
        createdById: "user-1",
      });
    });

    it("fires relation inference (fire-and-forget)", async () => {
      await createIssue(validInput, "user-1");

      expect(inferRelationsForIssue).toHaveBeenCalledWith("issue-1", "user-1");
    });

    it("denormalizes context libraries", async () => {
      const inputWithContext = {
        ...validInput,
        context: [
          { name: "webpack", version: "5.0.0" },
          { name: "babel", version: "7.0.0" },
        ],
      };

      await createIssue(inputWithContext, "user-1");

      const createCall = mockPrisma.issue.create.mock.calls[0][0];
      expect(createCall.data.contextLibraries).toEqual(["webpack", "babel"]);
    });

    it("returns appropriate _next_actions without inline patch", async () => {
      const result = await createIssue(validInput, "user-1");

      expect(result._next_actions[0]).toContain("call patch");
      expect(result._next_actions[1]).toContain("+2 more credits");
    });

    it("returns appropriate _next_actions with inline patch", async () => {
      patchService.submitPatch.mockResolvedValue({ id: "p1", creditsAwarded: 5 });

      const result = await createIssue(
        { ...validInput, patch: { explanation: "Fix the issue", steps: [{ type: "instruction" as const, text: "Do this" }] } },
        "user-1",
      );

      expect(result._next_actions[0]).toContain("report and patch are live");
    });
  });
});

// ── listIssues ──────────────────────────────────────────────────────────

describe("listIssues", () => {
  it("applies filters correctly", async () => {
    mockPrisma.issue.findMany.mockResolvedValue([]);
    mockPrisma.issue.count.mockResolvedValue(0);

    await listIssues({
      library: "react",
      version: "18.2.0",
      ecosystem: "npm",
      category: "crash",
      status: ["open", "confirmed"],
      severity: ["high"],
    });

    const call = mockPrisma.issue.findMany.mock.calls[0][0];
    expect(call.where.library).toEqual({ contains: "react", mode: "insensitive" });
    expect(call.where.version).toBe("18.2.0");
    expect(call.where.ecosystem).toEqual({ equals: "npm", mode: "insensitive" });
    expect(call.where.category).toBe("crash");
    expect(call.where.status).toEqual({ in: ["open", "confirmed"] });
    expect(call.where.severity).toBe("high");
  });

  it("handles single status value", async () => {
    mockPrisma.issue.findMany.mockResolvedValue([]);
    mockPrisma.issue.count.mockResolvedValue(0);

    await listIssues({ status: ["open"] });

    const call = mockPrisma.issue.findMany.mock.calls[0][0];
    expect(call.where.status).toBe("open");
  });

  it("sorts by accessed when specified", async () => {
    mockPrisma.issue.findMany.mockResolvedValue([]);
    mockPrisma.issue.count.mockResolvedValue(0);

    await listIssues({ sort: "accessed" });

    const call = mockPrisma.issue.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ accessCount: "desc" });
  });

  it("defaults to recent sort", async () => {
    mockPrisma.issue.findMany.mockResolvedValue([]);
    mockPrisma.issue.count.mockResolvedValue(0);

    await listIssues({});

    const call = mockPrisma.issue.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ createdAt: "desc" });
  });

  it("enriches with verifiedFixCount and relatedCount", async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      {
        ...makeIssue(),
        reporter: {},
        _count: { patches: 2, relationsFrom: 1, relationsTo: 2 },
        patches: [
          { verifications: [{ id: "v1" }, { id: "v2" }] },
          { verifications: [{ id: "v3" }] },
        ],
      },
    ]);
    mockPrisma.issue.count.mockResolvedValue(1);

    const result = await listIssues({});

    expect(result.issues[0].verifiedFixCount).toBe(3);
    expect(result.issues[0].relatedCount).toBe(3);
    expect(result.issues[0].patches).toBeUndefined();
  });

  it("sorts by patches when specified", async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      {
        ...makeIssue({ id: "i1" }),
        reporter: {},
        _count: { patches: 1, relationsFrom: 0, relationsTo: 0 },
        patches: [],
      },
      {
        ...makeIssue({ id: "i2" }),
        reporter: {},
        _count: { patches: 5, relationsFrom: 0, relationsTo: 0 },
        patches: [],
      },
    ]);
    mockPrisma.issue.count.mockResolvedValue(2);

    const result = await listIssues({ sort: "patches" });

    expect(result.issues[0]._count.patches).toBe(5);
    expect(result.issues[1]._count.patches).toBe(1);
  });

  it("applies pagination defaults", async () => {
    mockPrisma.issue.findMany.mockResolvedValue([]);
    mockPrisma.issue.count.mockResolvedValue(0);

    await listIssues({});

    const call = mockPrisma.issue.findMany.mock.calls[0][0];
    expect(call.take).toBe(20);
    expect(call.skip).toBe(0);
  });
});

// ── getUserIssues ───────────────────────────────────────────────────────

describe("getUserIssues", () => {
  it("queries by reporterId", async () => {
    mockPrisma.issue.findMany.mockResolvedValue([]);

    await getUserIssues("user-1");

    expect(mockPrisma.issue.findMany).toHaveBeenCalledWith({
      where: { reporterId: "user-1" },
      include: { _count: { select: { patches: true } } },
      orderBy: { createdAt: "desc" },
    });
  });
});
