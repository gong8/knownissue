-- Set default for existing NULL rows before making NOT NULL
UPDATE "User" SET "displayName" = 'Unknown' WHERE "displayName" IS NULL;

-- Make column required with default
ALTER TABLE "User" ALTER COLUMN "displayName" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "displayName" SET DEFAULT 'Unknown';
