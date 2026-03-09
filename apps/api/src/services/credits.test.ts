import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@knownissue/db", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    creditTransaction: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
  },
}));

import { prisma } from "@knownissue/db";
import {
  getCredits,
  awardCredits,
  deductCredits,
  penalizeCredits,
  getUserTransactions,
} from "./credits";

const mockFindUniqueOrThrow = prisma.user.findUniqueOrThrow as ReturnType<
  typeof vi.fn
>;
const mockUpdate = prisma.user.update as ReturnType<typeof vi.fn>;
const mockExecuteRaw = prisma.$executeRawUnsafe as ReturnType<typeof vi.fn>;
const mockTxCreate = prisma.creditTransaction.create as ReturnType<
  typeof vi.fn
>;
const mockTxFindMany = prisma.creditTransaction.findMany as ReturnType<
  typeof vi.fn
>;
const mockTxCount = prisma.creditTransaction.count as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCredits", () => {
  it("returns the user's credit balance", async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ credits: 42 });

    const result = await getCredits("user-1");

    expect(result).toBe(42);
    expect(mockFindUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { credits: true },
    });
  });

  it("throws when user not found", async () => {
    mockFindUniqueOrThrow.mockRejectedValue(new Error("Not found"));

    await expect(getCredits("nonexistent")).rejects.toThrow("Not found");
  });

  it("returns 0 for users with zero credits", async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ credits: 0 });

    const result = await getCredits("user-broke");
    expect(result).toBe(0);
  });
});

describe("awardCredits", () => {
  it("increments credits and creates a transaction", async () => {
    mockUpdate.mockResolvedValue({ credits: 15 });
    mockTxCreate.mockResolvedValue({});

    const result = await awardCredits("user-1", 5, "patch_submitted");

    expect(result).toBe(15);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { credits: { increment: 5 } },
      select: { credits: true },
    });
    expect(mockTxCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        amount: 5,
        type: "patch_submitted",
        balance: 15,
        relatedIssueId: null,
        relatedPatchId: null,
      },
    });
  });

  it("records relatedIssueId when provided", async () => {
    mockUpdate.mockResolvedValue({ credits: 6 });
    mockTxCreate.mockResolvedValue({});

    await awardCredits("user-1", 1, "issue_reported", {
      issueId: "issue-123",
    });

    expect(mockTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        relatedIssueId: "issue-123",
        relatedPatchId: null,
      }),
    });
  });

  it("records relatedPatchId when provided", async () => {
    mockUpdate.mockResolvedValue({ credits: 7 });
    mockTxCreate.mockResolvedValue({});

    await awardCredits("user-1", 2, "verification_performed", {
      patchId: "patch-456",
    });

    expect(mockTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        relatedIssueId: null,
        relatedPatchId: "patch-456",
      }),
    });
  });

  it("records both relatedIssueId and relatedPatchId", async () => {
    mockUpdate.mockResolvedValue({ credits: 12 });
    mockTxCreate.mockResolvedValue({});

    await awardCredits("user-1", 5, "patch_submitted", {
      issueId: "issue-1",
      patchId: "patch-1",
    });

    expect(mockTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        relatedIssueId: "issue-1",
        relatedPatchId: "patch-1",
      }),
    });
  });

  it("returns the new balance after increment", async () => {
    mockUpdate.mockResolvedValue({ credits: 100 });
    mockTxCreate.mockResolvedValue({});

    const result = await awardCredits("user-1", 50, "patch_submitted");
    expect(result).toBe(100);
  });
});

describe("deductCredits", () => {
  it("atomically deducts credits and creates negative transaction", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    mockFindUniqueOrThrow.mockResolvedValue({ credits: 4 });
    mockTxCreate.mockResolvedValue({});

    const result = await deductCredits("user-1", 1, "search_performed");

    expect(result).toBe(4);
    expect(mockExecuteRaw).toHaveBeenCalledWith(
      `UPDATE "User" SET credits = credits - $1, "updatedAt" = NOW() WHERE id = $2 AND credits >= $1`,
      1,
      "user-1"
    );
    expect(mockTxCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        amount: -1,
        type: "search_performed",
        balance: 4,
        relatedIssueId: null,
        relatedPatchId: null,
      },
    });
  });

  it("throws when insufficient credits (raw SQL returns 0)", async () => {
    mockExecuteRaw.mockResolvedValue(0);

    await expect(
      deductCredits("user-1", 10, "search_performed")
    ).rejects.toThrow("Insufficient credits. Required: 10");
  });

  it("does not create a transaction when deduction fails", async () => {
    mockExecuteRaw.mockResolvedValue(0);

    await expect(
      deductCredits("user-1", 5, "search_performed")
    ).rejects.toThrow();

    expect(mockTxCreate).not.toHaveBeenCalled();
  });

  it("records related entities on deduction", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    mockFindUniqueOrThrow.mockResolvedValue({ credits: 3 });
    mockTxCreate.mockResolvedValue({});

    await deductCredits("user-1", 2, "duplicate_penalty", {
      issueId: "issue-dup",
    });

    expect(mockTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: -2,
        relatedIssueId: "issue-dup",
        relatedPatchId: null,
      }),
    });
  });
});

describe("penalizeCredits", () => {
  it("uses GREATEST to floor at 0", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    mockFindUniqueOrThrow.mockResolvedValue({ credits: 0 });
    mockTxCreate.mockResolvedValue({});

    const result = await penalizeCredits("user-1", 10, "duplicate_penalty");

    expect(result).toBe(0);
    expect(mockExecuteRaw).toHaveBeenCalledWith(
      `UPDATE "User" SET credits = GREATEST(credits - $1, 0), "updatedAt" = NOW() WHERE id = $2`,
      10,
      "user-1"
    );
  });

  it("creates a transaction with negative amount", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    mockFindUniqueOrThrow.mockResolvedValue({ credits: 3 });
    mockTxCreate.mockResolvedValue({});

    await penalizeCredits("user-1", 5, "duplicate_penalty");

    expect(mockTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: -5,
        balance: 3,
      }),
    });
  });

  it("records related entities on penalty", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    mockFindUniqueOrThrow.mockResolvedValue({ credits: 0 });
    mockTxCreate.mockResolvedValue({});

    await penalizeCredits("user-1", 2, "duplicate_penalty", {
      issueId: "issue-dup",
      patchId: "patch-dup",
    });

    expect(mockTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        relatedIssueId: "issue-dup",
        relatedPatchId: "patch-dup",
      }),
    });
  });

  it("does not throw even when penalty exceeds balance (floors at 0)", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    mockFindUniqueOrThrow.mockResolvedValue({ credits: 0 });
    mockTxCreate.mockResolvedValue({});

    // Should not throw even with large penalty
    await expect(
      penalizeCredits("user-1", 999, "duplicate_penalty")
    ).resolves.toBe(0);
  });
});

describe("getUserTransactions", () => {
  it("returns paginated transactions with total count", async () => {
    const mockTransactions = [
      { id: "tx-1", amount: 5, type: "patch_submitted" },
      { id: "tx-2", amount: -1, type: "search_performed" },
    ];
    mockTxFindMany.mockResolvedValue(mockTransactions);
    mockTxCount.mockResolvedValue(50);

    const result = await getUserTransactions("user-1", {
      limit: 10,
      offset: 0,
    });

    expect(result.transactions).toEqual(mockTransactions);
    expect(result.total).toBe(50);
    expect(mockTxFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 10,
      skip: 0,
    });
  });

  it("uses default limit=20 and offset=0 when not provided", async () => {
    mockTxFindMany.mockResolvedValue([]);
    mockTxCount.mockResolvedValue(0);

    await getUserTransactions("user-1", {});

    expect(mockTxFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 0,
    });
  });

  it("applies custom limit and offset", async () => {
    mockTxFindMany.mockResolvedValue([]);
    mockTxCount.mockResolvedValue(100);

    await getUserTransactions("user-1", { limit: 5, offset: 25 });

    expect(mockTxFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 5,
      skip: 25,
    });
  });

  it("returns empty array with total 0 for user with no transactions", async () => {
    mockTxFindMany.mockResolvedValue([]);
    mockTxCount.mockResolvedValue(0);

    const result = await getUserTransactions("user-no-tx", {});

    expect(result.transactions).toEqual([]);
    expect(result.total).toBe(0);
  });
});
