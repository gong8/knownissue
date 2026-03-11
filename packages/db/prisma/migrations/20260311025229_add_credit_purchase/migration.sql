-- AlterEnum
ALTER TYPE "CreditEventType" ADD VALUE 'credit_purchase';

-- AlterTable
ALTER TABLE "CreditTransaction" ADD COLUMN     "stripeCheckoutSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_stripeCheckoutSessionId_key" ON "CreditTransaction"("stripeCheckoutSessionId");
