import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrismaInner } = vi.hoisted(() => {
  const mockPrismaInner = {
    user: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    creditTransaction: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  };
  // Interactive transaction passes a `tx` client — reuse the same mock methods
  mockPrismaInner.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrismaInner) => Promise<unknown>) => fn(mockPrismaInner)
  );
  return { mockPrismaInner };
});

vi.mock("@knownissue/db", () => ({
  prisma: mockPrismaInner,
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
const mockQueryRaw = (prisma as unknown as { $queryRawUnsafe: ReturnType<typeof vi.fn> })
  .$queryRawUnsafe as ReturnType<typeof vi.fn>;
const mockTxCreate = prisma.creditTransaction.create as ReturnType<
  typeof vi.fn
>;
const mockTxFindMany = prisma.creditTransaction.findMany as ReturnType<
  typeof vi.fn
>;
const mockTxCount = prisma.creditTransaction.count as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Re-set $transaction after clearAllMocks (v4 clears implementations)
  mockPrismaInner.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrismaInner) => Promise<unknown>) => fn(mockPrismaInner)
  );
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
    mockQueryRaw.mockResolvedValue([{ credits: 4 }]);
    mockTxCreate.mockResolvedValue({});

    const result = await deductCredits("user-1", 1, "search_performed");

    expect(result).toBe(4);
    expect(mockQueryRaw).toHaveBeenCalledWith(
      `UPDATE "User" SET credits = credits - $1, "updatedAt" = NOW() WHERE id = $2 AND credits >= $1 RETURNING credits`,
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

  it("throws when insufficient credits (raw SQL returns empty)", async () => {
    mockQueryRaw.mockResolvedValue([]);

    await expect(
      deductCredits("user-1", 10, "search_performed")
    ).rejects.toThrow("Insufficient credits. Required: 10");
  });

  it("does not create a transaction when deduction fails", async () => {
    mockQueryRaw.mockResolvedValue([]);

    await expect(
      deductCredits("user-1", 5, "search_performed")
    ).rejects.toThrow();

    expect(mockTxCreate).not.toHaveBeenCalled();
  });

  it("records related entities on deduction", async () => {
    mockQueryRaw.mockResolvedValue([{ credits: 3 }]);
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
    mockQueryRaw.mockResolvedValue([{ credits: 0, previousBalance: 3 }]);
    mockTxCreate.mockResolvedValue({});

    const result = await penalizeCredits("user-1", 10, "duplicate_penalty");

    expect(result).toEqual({ newBalance: 0, actualDeduction: 3 });
    expect(mockQueryRaw).toHaveBeenCalledWith(
      `WITH old AS (SELECT credits FROM "User" WHERE id = $2)
       UPDATE "User" SET credits = GREATEST(credits - $1, 0), "updatedAt" = NOW()
       WHERE id = $2
       RETURNING credits, (SELECT credits FROM old) AS "previousBalance"`,
      10,
      "user-1"
    );
  });

  it("records actual deduction amount (not raw penalty) in transaction", async () => {
    mockQueryRaw.mockResolvedValue([{ credits: 0, previousBalance: 3 }]);
    mockTxCreate.mockResolvedValue({});

    await penalizeCredits("user-1", 5, "duplicate_penalty");

    expect(mockTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: -3,   // actual deduction was 3, not 5
        balance: 0,
      }),
    });
  });

  it("skips transaction when actual deduction is 0", async () => {
    mockQueryRaw.mockResolvedValue([{ credits: 0, previousBalance: 0 }]);
    mockTxCreate.mockResolvedValue({});

    await penalizeCredits("user-1", 5, "duplicate_penalty");

    expect(mockTxCreate).not.toHaveBeenCalled();
  });

  it("records related entities on penalty", async () => {
    mockQueryRaw.mockResolvedValue([{ credits: 3, previousBalance: 5 }]);
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
    mockQueryRaw.mockResolvedValue([{ credits: 0, previousBalance: 0 }]);
    mockTxCreate.mockResolvedValue({});

    // Should not throw even with large penalty
    await expect(
      penalizeCredits("user-1", 999, "duplicate_penalty")
    ).resolves.toEqual({ newBalance: 0, actualDeduction: 0 });
  });

  it("returns 0 when user not found (empty result)", async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await penalizeCredits("user-1", 5, "duplicate_penalty");

    expect(result).toEqual({ newBalance: 0, actualDeduction: 0 });
    expect(mockTxCreate).not.toHaveBeenCalled();
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
