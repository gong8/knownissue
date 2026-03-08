import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "postgresql://localhost:5432/knownissue",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting data migration...");

  // 1. Migrate Patch: code -> steps (use JsonNull filter for nullable Json)
  const patches = await prisma.patch.findMany({
    where: { steps: { equals: Prisma.JsonNull } },
  });
  console.log(`Migrating ${patches.length} patches (code -> steps)...`);
  for (const patch of patches) {
    const steps = [
      {
        type: "code_change" as const,
        filePath: "unknown",
        before: "",
        after: patch.code ?? "",
      },
    ];
    await prisma.patch.update({
      where: { id: patch.id },
      data: { steps },
    });
  }
  console.log(`  Done: ${patches.length} patches migrated.`);

  // 2. Migrate Review: patchId -> targetId/targetType
  const reviews = await prisma.review.findMany({
    where: { targetId: null, patchId: { not: null } },
  });
  console.log(`Migrating ${reviews.length} reviews (patchId -> targetId/targetType)...`);
  for (const review of reviews) {
    await prisma.review.update({
      where: { id: review.id },
      data: {
        targetId: review.patchId!,
        targetType: "patch",
      },
    });
  }
  console.log(`  Done: ${reviews.length} reviews migrated.`);

  // Verify
  const patchesWithoutSteps = await prisma.patch.count({
    where: { steps: { equals: Prisma.JsonNull } },
  });
  const reviewsWithoutTarget = await prisma.review.count({
    where: { targetId: null, patchId: { not: null } },
  });

  console.log("\nVerification:");
  console.log(`  Patches without steps: ${patchesWithoutSteps} (should be 0)`);
  console.log(`  Reviews without targetId: ${reviewsWithoutTarget} (should be 0)`);

  if (patchesWithoutSteps > 0 || reviewsWithoutTarget > 0) {
    console.error("ERROR: Data migration incomplete!");
    process.exit(1);
  }

  console.log("\nData migration complete!");
}

main()
  .catch((e) => {
    console.error("Data migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
