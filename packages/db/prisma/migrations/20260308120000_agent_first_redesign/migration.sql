-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('bug', 'patch');

-- AlterEnum
ALTER TYPE "CreditEventType" ADD VALUE 'bug_reported';
ALTER TYPE "CreditEventType" ADD VALUE 'duplicate_penalty';
ALTER TYPE "CreditEventType" ADD VALUE 'review_given';
ALTER TYPE "CreditEventType" ADD VALUE 'bug_upvoted';
ALTER TYPE "CreditEventType" ADD VALUE 'bug_downvoted';

-- AlterTable: User - change default credits from 10 to 5
ALTER TABLE "User" ALTER COLUMN "credits" SET DEFAULT 5;

-- AlterTable: Bug - add new fields, make title/description nullable
ALTER TABLE "Bug" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "Bug" ALTER COLUMN "description" DROP NOT NULL;
ALTER TABLE "Bug" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "Bug" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "Bug" ADD COLUMN "stackTrace" TEXT;
ALTER TABLE "Bug" ADD COLUMN "fingerprint" TEXT;
ALTER TABLE "Bug" ADD COLUMN "triggerCode" TEXT;
ALTER TABLE "Bug" ADD COLUMN "expectedBehavior" TEXT;
ALTER TABLE "Bug" ADD COLUMN "actualBehavior" TEXT;
ALTER TABLE "Bug" ADD COLUMN "relatedLibraries" JSONB;
ALTER TABLE "Bug" ADD COLUMN "environment" JSONB;
ALTER TABLE "Bug" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Bug_fingerprint_idx" ON "Bug"("fingerprint");

-- AlterTable: Patch - make code nullable, add steps and versionConstraint
ALTER TABLE "Patch" ALTER COLUMN "code" DROP NOT NULL;
ALTER TABLE "Patch" ADD COLUMN "steps" JSONB;
ALTER TABLE "Patch" ADD COLUMN "versionConstraint" TEXT;

-- AlterTable: Review - add targetId, targetType, version, bugId; make patchId nullable
ALTER TABLE "Review" ALTER COLUMN "patchId" DROP NOT NULL;
ALTER TABLE "Review" ADD COLUMN "targetId" TEXT;
ALTER TABLE "Review" ADD COLUMN "targetType" "ReviewTargetType";
ALTER TABLE "Review" ADD COLUMN "version" TEXT;
ALTER TABLE "Review" ADD COLUMN "bugId" TEXT;

-- AddForeignKey: Review -> Bug
ALTER TABLE "Review" ADD CONSTRAINT "Review_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: unique constraint on targetId + targetType + reviewerId
CREATE UNIQUE INDEX "Review_targetId_targetType_reviewerId_key" ON "Review"("targetId", "targetType", "reviewerId");

-- AlterTable: BugRevision - add snapshot column
ALTER TABLE "BugRevision" ADD COLUMN "snapshot" JSONB;
