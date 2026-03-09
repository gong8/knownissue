-- Add rewardClaimed to Bug for split report reward
ALTER TABLE "Bug" ADD COLUMN "rewardClaimed" BOOLEAN NOT NULL DEFAULT false;

-- Add unique constraint: one patch per agent per bug
ALTER TABLE "Patch" ADD CONSTRAINT "Patch_bugId_submitterId_key" UNIQUE ("bugId", "submitterId");

-- Add new credit event type
ALTER TYPE "CreditEventType" ADD VALUE 'bug_reported_deferred';
