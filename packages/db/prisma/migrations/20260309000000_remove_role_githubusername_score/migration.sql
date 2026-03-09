-- AlterTable: Drop score from Patch
ALTER TABLE "Patch" DROP COLUMN "score";

-- AlterTable: Drop githubUsername and role from User
ALTER TABLE "User" DROP COLUMN "githubUsername",
DROP COLUMN "role";

-- DropEnum
DROP TYPE "Role";
