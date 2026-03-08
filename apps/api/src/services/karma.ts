import { prisma } from "@knownissue/db";

export async function getKarma(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { karma: true },
  });
  return user.karma;
}

export async function awardKarma(userId: string, amount: number): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { karma: { increment: amount } },
    select: { karma: true },
  });
  return user.karma;
}

export async function deductKarma(userId: string, amount: number): Promise<number> {
  // Atomic: only decrements if karma >= amount
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "User" SET karma = karma - $1, "updatedAt" = NOW() WHERE id = $2 AND karma >= $1`,
    amount,
    userId
  );

  if (result === 0) {
    throw new Error(`Insufficient karma. Required: ${amount}`);
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { karma: true },
  });
  return user.karma;
}
