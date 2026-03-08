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
  // Atomic decrement with floor check
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { karma: true },
  });

  if (user.karma < amount) {
    throw new Error(`Insufficient karma. Required: ${amount}, Current: ${user.karma}`);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { karma: { decrement: amount } },
    select: { karma: true },
  });

  return updated.karma;
}
