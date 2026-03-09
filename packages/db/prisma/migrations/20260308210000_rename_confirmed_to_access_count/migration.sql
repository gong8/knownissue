-- Rename confirmedCount to accessCount (honest about what the metric measures)
ALTER TABLE "Bug" RENAME COLUMN "confirmedCount" TO "accessCount";
