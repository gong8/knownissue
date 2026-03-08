-- AlterTable
ALTER TABLE "OAuthAccessToken" ADD COLUMN     "resource" TEXT;

-- AlterTable
ALTER TABLE "OAuthAuthorizationCode" ADD COLUMN     "resource" TEXT;
