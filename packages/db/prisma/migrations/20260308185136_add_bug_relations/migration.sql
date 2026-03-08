-- CreateEnum
CREATE TYPE "BugRelationType" AS ENUM ('same_root_cause', 'version_regression', 'cascading_dependency', 'interaction_conflict', 'shared_fix', 'fix_conflict');

-- CreateEnum
CREATE TYPE "RelationSource" AS ENUM ('agent', 'system');

-- CreateTable
CREATE TABLE "BugRelation" (
    "id" TEXT NOT NULL,
    "type" "BugRelationType" NOT NULL,
    "source" "RelationSource" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "metadata" JSONB,
    "sourceBugId" TEXT NOT NULL,
    "targetBugId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugRelation_sourceBugId_idx" ON "BugRelation"("sourceBugId");

-- CreateIndex
CREATE INDEX "BugRelation_targetBugId_idx" ON "BugRelation"("targetBugId");

-- CreateIndex
CREATE INDEX "BugRelation_type_idx" ON "BugRelation"("type");

-- CreateIndex
CREATE UNIQUE INDEX "BugRelation_sourceBugId_targetBugId_type_key" ON "BugRelation"("sourceBugId", "targetBugId", "type");

-- AddForeignKey
ALTER TABLE "BugRelation" ADD CONSTRAINT "BugRelation_sourceBugId_fkey" FOREIGN KEY ("sourceBugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugRelation" ADD CONSTRAINT "BugRelation_targetBugId_fkey" FOREIGN KEY ("targetBugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugRelation" ADD CONSTRAINT "BugRelation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
