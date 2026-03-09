-- DropTable: Review
DROP TABLE IF EXISTS "Review" CASCADE;

-- DropEnum: Vote
DROP TYPE IF EXISTS "Vote";

-- DropEnum: ReviewTargetType
DROP TYPE IF EXISTS "ReviewTargetType";

-- CreateEnum: VerificationOutcome
CREATE TYPE "VerificationOutcome" AS ENUM ('fixed', 'not_fixed', 'partial');

-- CreateEnum: BugAccuracy
CREATE TYPE "BugAccuracy" AS ENUM ('accurate', 'inaccurate');

-- CreateEnum: BugCategory
CREATE TYPE "BugCategory" AS ENUM ('crash', 'build', 'types', 'performance', 'behavior', 'config', 'compatibility', 'install');

-- Migrate EntityType enum: replace 'review' with 'verification'
ALTER TYPE "EntityType" RENAME TO "EntityType_old";
CREATE TYPE "EntityType" AS ENUM ('bug', 'patch', 'verification', 'user');
ALTER TABLE "AuditLog" ALTER COLUMN "entityType" TYPE "EntityType" USING (
  CASE "entityType"::text
    WHEN 'review' THEN 'verification'::"EntityType"
    ELSE "entityType"::text::"EntityType"
  END
);
DROP TYPE "EntityType_old";

-- Migrate CreditEventType enum: remove old values, add new ones
ALTER TYPE "CreditEventType" RENAME TO "CreditEventType_old";
CREATE TYPE "CreditEventType" AS ENUM ('signup', 'search', 'patch_submitted', 'bug_reported', 'duplicate_penalty', 'verification_given', 'patch_verified_fixed', 'patch_verified_not_fixed');
ALTER TABLE "CreditTransaction" ALTER COLUMN "type" TYPE "CreditEventType" USING (
  CASE "type"::text
    WHEN 'review_given' THEN 'verification_given'::"CreditEventType"
    WHEN 'patch_upvoted' THEN 'patch_verified_fixed'::"CreditEventType"
    WHEN 'patch_downvoted' THEN 'patch_verified_not_fixed'::"CreditEventType"
    WHEN 'bug_upvoted' THEN 'verification_given'::"CreditEventType"
    WHEN 'bug_downvoted' THEN 'verification_given'::"CreditEventType"
    ELSE "type"::text::"CreditEventType"
  END
);
DROP TYPE "CreditEventType_old";

-- Bug model changes: drop old columns
ALTER TABLE "Bug" DROP COLUMN IF EXISTS "relatedLibraries";
ALTER TABLE "Bug" DROP COLUMN IF EXISTS "environment";
ALTER TABLE "Bug" DROP COLUMN IF EXISTS "score";

-- Bug model changes: add new columns
ALTER TABLE "Bug" ADD COLUMN "context" JSONB;
ALTER TABLE "Bug" ADD COLUMN "contextLibraries" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Bug" ADD COLUMN "runtime" TEXT;
ALTER TABLE "Bug" ADD COLUMN "platform" TEXT;
ALTER TABLE "Bug" ADD COLUMN "category" "BugCategory";
ALTER TABLE "Bug" ADD COLUMN "confirmedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Bug" ADD COLUMN "searchHitCount" INTEGER NOT NULL DEFAULT 0;

-- Remove default after adding (Prisma manages it now)
ALTER TABLE "Bug" ALTER COLUMN "contextLibraries" DROP DEFAULT;

-- CreateTable: Verification
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "outcome" "VerificationOutcome" NOT NULL,
    "note" TEXT,
    "errorBefore" TEXT,
    "errorAfter" TEXT,
    "testedVersion" TEXT,
    "bugAccuracy" "BugAccuracy" NOT NULL DEFAULT 'accurate',
    "patchId" TEXT NOT NULL,
    "verifierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PatchAccess
CREATE TABLE "PatchAccess" (
    "id" TEXT NOT NULL,
    "patchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatchAccess_pkey" PRIMARY KEY ("id")
);

-- Verification indexes
CREATE INDEX "Verification_patchId_idx" ON "Verification"("patchId");
CREATE INDEX "Verification_verifierId_idx" ON "Verification"("verifierId");
CREATE UNIQUE INDEX "Verification_patchId_verifierId_key" ON "Verification"("patchId", "verifierId");

-- PatchAccess unique constraint
CREATE UNIQUE INDEX "PatchAccess_patchId_userId_key" ON "PatchAccess"("patchId", "userId");

-- Foreign keys: Verification
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_patchId_fkey" FOREIGN KEY ("patchId") REFERENCES "Patch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_verifierId_fkey" FOREIGN KEY ("verifierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: PatchAccess
ALTER TABLE "PatchAccess" ADD CONSTRAINT "PatchAccess_patchId_fkey" FOREIGN KEY ("patchId") REFERENCES "Patch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatchAccess" ADD CONSTRAINT "PatchAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GIN index on contextLibraries for array search
CREATE INDEX "Bug_contextLibraries_idx" ON "Bug" USING GIN ("contextLibraries");
