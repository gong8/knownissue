-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sentMilestones" TEXT[] DEFAULT ARRAY[]::TEXT[];
