-- Add GIN index on contextLibraries for efficient array containment queries
CREATE INDEX IF NOT EXISTS "Bug_contextLibraries_idx" ON "Bug" USING GIN ("contextLibraries");
