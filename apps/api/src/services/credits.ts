import { prisma } from "@knownissue/db";
import type { CreditEventType } from "@knownissue/db";
import { checkMilestones } from "../email/triggers";

export async function getCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });
  return user.credits;
}

export async function awardCredits(
  userId: string,
  amount: number,
  type: CreditEventType,
  related?: { issueId?: string; patchId?: string }
): Promise<number> {
  const newBalance = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
      select: { credits: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        type,
        balance: user.credits,
        relatedIssueId: related?.issueId ?? null,
        relatedPatchId: related?.patchId ?? null,
      },
    });

    return user.credits;
  });

  // Fire-and-forget milestone check after successful credit award
  checkMilestones(userId).catch(() => {});

  return newBalance;
}

export async function deductCredits(
  userId: string,
  amount: number,
  type: CreditEventType,
  related?: { issueId?: string; patchId?: string }
): Promise<number> {
  return await prisma.$transaction(async (tx) => {
    // Atomic: deduct and return new balance in one query
    const result = await tx.$queryRawUnsafe<Array<{ credits: number }>>(
      `UPDATE "User" SET credits = credits - $1, "updatedAt" = NOW() WHERE id = $2 AND credits >= $1 RETURNING credits`,
      amount,
      userId
    );

    if (result.length === 0) {
      throw new Error(`Insufficient credits. Required: ${amount}`);
    }

    const newBalance = result[0].credits;

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -amount,
        type,
        balance: newBalance,
        relatedIssueId: related?.issueId ?? null,
        relatedPatchId: related?.patchId ?? null,
      },
    });

    return newBalance;
  });
}

export async function penalizeCredits(
  userId: string,
  amount: number,
  type: CreditEventType,
  related?: { issueId?: string; patchId?: string }
): Promise<{ newBalance: number; actualDeduction: number }> {
  // Atomic: penalize (floor at 0) and return both old and new balance
  const result = await prisma.$queryRawUnsafe<
    Array<{ credits: number; previousBalance: number }>
  >(
    `WITH old AS (SELECT credits FROM "User" WHERE id = $2)
     UPDATE "User" SET credits = GREATEST(credits - $1, 0), "updatedAt" = NOW()
     WHERE id = $2
     RETURNING credits, (SELECT credits FROM old) AS "previousBalance"`,
    amount,
    userId
  );

  if (result.length === 0) return { newBalance: 0, actualDeduction: 0 };

  const newBalance = result[0].credits;
  const previousBalance = result[0].previousBalance;
  const actualDeduction = previousBalance - newBalance;

  if (actualDeduction > 0) {
    await prisma.creditTransaction.create({
      data: {
        userId,
        amount: -actualDeduction,
        type,
        balance: newBalance,
        relatedIssueId: related?.issueId ?? null,
        relatedPatchId: related?.patchId ?? null,
      },
    });
  }

  return { newBalance, actualDeduction };
}

export async function awardCreditsPurchase(
  userId: string,
  amount: number,
  stripeCheckoutSessionId: string
): Promise<number> {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
      select: { credits: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        type: "credit_purchase",
        balance: user.credits,
        stripeCheckoutSessionId,
      },
    });

    return user.credits;
  });
}

export async function getUserTransactions(
  userId: string,
  params: { limit?: number; offset?: number }
) {
  const { limit = 20, offset = 0 } = params;

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.creditTransaction.count({ where: { userId } }),
  ]);

  return { transactions, total };
}
