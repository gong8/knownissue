import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@knownissue/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("./fingerprint", () => ({
  findByFingerprint: vi.fn(),
}));

vi.mock("./embedding", () => ({
  generateEmbedding: vi.fn(),
}));

import { prisma } from "@knownissue/db";
import { findByFingerprint } from "./fingerprint";
import { generateEmbedding } from "./embedding";
import { validateContent, checkDuplicate } from "./spam";

const mockFindByFingerprint = findByFingerprint as ReturnType<typeof vi.fn>;
const mockGenerateEmbedding = generateEmbedding as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateContent", () => {
  it("returns valid: false when both title and description are null", () => {
    const result = validateContent(null, null);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("returns valid: false when both are empty strings (falsy)", () => {
    const result = validateContent("", "");
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("returns valid: true when title is present", () => {
    const result = validateContent("Error message", null);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns valid: true when description is present", () => {
    const result = validateContent(null, "Something went wrong");
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns valid: true when both present", () => {
    const result = validateContent("Title", "Description");
    expect(result.valid).toBe(true);
  });
});

describe("checkDuplicate", () => {
  describe("fingerprint parameter (no-op, handled by caller)", () => {
    it("does not call findByFingerprint (fingerprint check is done by caller)", async () => {
      mockGenerateEmbedding.mockResolvedValue(null);

      await checkDuplicate("some text", "fp-123");

      expect(mockFindByFingerprint).not.toHaveBeenCalled();
    });

    it("returns embedding when generated", async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2]);
      mockQueryRaw.mockResolvedValue([]);

      const result = await checkDuplicate("some text", null);

      expect(result.embedding).toEqual([0.1, 0.2]);
    });
  });

  describe("embedding similarity (Tier 2/3)", () => {
    it("returns isDuplicate: false when embedding generation fails", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue(null);

      const result = await checkDuplicate("some text", "no-match-fp");

      expect(result.isDuplicate).toBe(false);
      expect(result.warning).toBeUndefined();
      expect(result.similarIssues).toBeUndefined();
    });

    it("returns isDuplicate: true when similarity >= 0.96 (reject threshold)", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockQueryRaw.mockResolvedValue([
        { id: "issue-1", title: "Very similar", similarity: 0.97 },
      ]);

      const result = await checkDuplicate("some text", "no-match-fp");

      expect(result.isDuplicate).toBe(true);
      expect(result.warning).toContain("very similar issue");
      expect(result.similarIssues).toHaveLength(1);
    });

    it("returns warning (not duplicate) when similarity >= 0.90 but < 0.96", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockQueryRaw.mockResolvedValue([
        { id: "issue-1", title: "Somewhat similar", similarity: 0.92 },
      ]);

      const result = await checkDuplicate("some text", "no-match-fp");

      expect(result.isDuplicate).toBe(false);
      expect(result.warning).toContain("Similar issues found");
      expect(result.similarIssues).toHaveLength(1);
    });

    it("returns clean when no similar issues above warn threshold", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockQueryRaw.mockResolvedValue([
        { id: "issue-1", title: "Not similar", similarity: 0.5 },
        { id: "issue-2", title: "Also not", similarity: 0.3 },
      ]);

      const result = await checkDuplicate("some text", "no-match-fp");

      expect(result.isDuplicate).toBe(false);
      expect(result.warning).toBeUndefined();
      expect(result.similarIssues).toBeUndefined();
    });

    it("returns clean when embedding returns results but all below 0.90", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockQueryRaw.mockResolvedValue([
        { id: "issue-1", title: "Low", similarity: 0.89 },
      ]);

      const result = await checkDuplicate("some text", "no-match-fp");

      expect(result.isDuplicate).toBe(false);
      expect(result.warning).toBeUndefined();
    });

    it("returns clean when no embedding results at all", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockQueryRaw.mockResolvedValue([]);

      const result = await checkDuplicate("some text", "no-match-fp");

      expect(result.isDuplicate).toBe(false);
    });

    it("filters similarity results correctly with mixed scores", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockQueryRaw.mockResolvedValue([
        { id: "issue-1", title: "Exact dup", similarity: 0.98 },
        { id: "issue-2", title: "Similar", similarity: 0.93 },
        { id: "issue-3", title: "Not similar", similarity: 0.7 },
      ]);

      const result = await checkDuplicate("some text", "no-match-fp");

      expect(result.isDuplicate).toBe(true);
      // Should include only issues >= 0.90
      expect(result.similarIssues).toHaveLength(2);
      expect(result.similarIssues?.map((i) => i.id)).toEqual([
        "issue-1",
        "issue-2",
      ]);
    });

    it("passes userId to generateEmbedding", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue(null);

      await checkDuplicate("some text", null, "user-123");

      expect(mockGenerateEmbedding).toHaveBeenCalledWith(
        "some text",
        "user-123"
      );
    });

    it("proceeds to embedding check regardless of fingerprint parameter", async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1]);
      mockQueryRaw.mockResolvedValue([]);

      const result = await checkDuplicate("text", "fp-nomatch", "user-1");

      expect(mockGenerateEmbedding).toHaveBeenCalledWith("text", "user-1");
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe("boundary values", () => {
    it("similarity exactly 0.90 triggers warning", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue([0.1]);
      mockQueryRaw.mockResolvedValue([
        { id: "issue-1", title: "Boundary", similarity: 0.9 },
      ]);

      const result = await checkDuplicate("text");

      expect(result.isDuplicate).toBe(false);
      expect(result.warning).toBeDefined();
      expect(result.similarIssues).toHaveLength(1);
    });

    it("similarity exactly 0.96 triggers rejection", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue([0.1]);
      mockQueryRaw.mockResolvedValue([
        { id: "issue-1", title: "Boundary reject", similarity: 0.96 },
      ]);

      const result = await checkDuplicate("text");

      expect(result.isDuplicate).toBe(true);
    });

    it("similarity 0.8999 is clean (below warn threshold)", async () => {
      mockFindByFingerprint.mockResolvedValue(null);
      mockGenerateEmbedding.mockResolvedValue([0.1]);
      mockQueryRaw.mockResolvedValue([
        { id: "issue-1", title: "Below", similarity: 0.8999 },
      ]);

      const result = await checkDuplicate("text");

      expect(result.isDuplicate).toBe(false);
      expect(result.warning).toBeUndefined();
    });
  });
});
