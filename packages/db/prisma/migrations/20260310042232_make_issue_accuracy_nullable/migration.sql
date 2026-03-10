-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BugCategory" ADD VALUE 'hallucination';
ALTER TYPE "BugCategory" ADD VALUE 'deprecated';

-- AlterTable
ALTER TABLE "Bug" ALTER COLUMN "library" DROP NOT NULL,
ALTER COLUMN "version" DROP NOT NULL,
ALTER COLUMN "ecosystem" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Verification" ALTER COLUMN "bugAccuracy" DROP NOT NULL,
ALTER COLUMN "bugAccuracy" DROP DEFAULT;
