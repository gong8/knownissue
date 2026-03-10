import { prisma } from "@knownissue/db";
import type { CreditEventType } from "@knownissue/db";

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
        type,
        balance: user.credits,
        relatedIssueId: related?.issueId ?? null,
        relatedPatchId: related?.patchId ?? null,
      },
    });

    return user.credits;
  });
}

export async function deductCredits(
  userId: string,
  amount: number,
  type: CreditEventType,
  related?: { issueId?: string; patchId?: string }
): Promise<number> {
  // Atomic: only decrements if credits >= amount
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "User" SET credits = credits - $1, "updatedAt" = NOW() WHERE id = $2 AND credits >= $1`,
    amount,
    userId
  );

  if (result === 0) {
    throw new Error(`Insufficient credits. Required: ${amount}`);
  }

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { credits: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -amount,
        type,
        balance: user.credits,
        relatedIssueId: related?.issueId ?? null,
        relatedPatchId: related?.patchId ?? null,
      },
    });

    return user.credits;
  });
}

export async function penalizeCredits(
  userId: string,
  amount: number,
  type: CreditEventType,
  related?: { issueId?: string; patchId?: string }
): Promise<number> {
  // Read balance before penalty to compute actual deduction
  const userBefore = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });
  const previousBalance = userBefore.credits;

  // Floor at 0 — penalties cannot go negative
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET credits = GREATEST(credits - $1, 0), "updatedAt" = NOW() WHERE id = $2`,
    amount,
    userId
  );

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });

  const actualDeduction = previousBalance - user.credits;

  if (actualDeduction > 0) {
    await prisma.creditTransaction.create({
      data: {
        userId,
        amount: -actualDeduction,
        type,
        balance: user.credits,
        relatedIssueId: related?.issueId ?? null,
        relatedPatchId: related?.patchId ?? null,
      },
    });
  }

  return user.credits;
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
