import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fetchClerkDisplayName(clerkId: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required");
  const res = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) {
    console.warn(`  Failed to fetch Clerk user ${clerkId}: ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { first_name?: string; last_name?: string };
  const parts = [data.first_name, data.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { displayName: null },
    select: { id: true, clerkId: true },
  });

  console.log(`Found ${users.length} users without displayName`);

  let updated = 0;
  let failed = 0;

  for (const user of users) {
    const name = await fetchClerkDisplayName(user.clerkId);
    if (name) {
      await prisma.user.update({
        where: { id: user.id },
        data: { displayName: name },
      });
      console.log(`  Updated ${user.clerkId} -> "${name}"`);
      updated++;
    } else {
      console.warn(`  Skipped ${user.clerkId} (no name found)`);
      failed++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
