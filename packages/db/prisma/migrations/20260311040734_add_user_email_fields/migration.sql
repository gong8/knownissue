-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email" TEXT,
ADD COLUMN     "emailUnsubscribed" BOOLEAN NOT NULL DEFAULT false;
