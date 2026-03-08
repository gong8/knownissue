import { prisma } from "@knownissue/db";

export async function getCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });
  return user.credits;
}

export async function awardCredits(userId: string, amount: number): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: amount } },
    select: { credits: true },
  });
  return user.credits;
}

export async function deductCredits(userId: string, amount: number): Promise<number> {
  // Atomic: only decrements if credits >= amount
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "User" SET credits = credits - $1, "updatedAt" = NOW() WHERE id = $2 AND credits >= $1`,
    amount,
    userId
  );

  if (result === 0) {
    throw new Error(`Insufficient credits. Required: ${amount}`);
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  });
  return user.credits;
}
