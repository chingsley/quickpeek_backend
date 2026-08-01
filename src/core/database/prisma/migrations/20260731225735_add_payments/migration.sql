-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PAYSTACK');

-- CreateEnum
CREATE TYPE "PaymentAccountStatus" AS ENUM ('PENDING', 'ONBOARDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('QUESTION_PAYMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_userId_fkey";

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "userId",
ADD COLUMN     "answerRequestId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "payeeId" TEXT NOT NULL,
ADD COLUMN     "payerId" TEXT NOT NULL,
ADD COLUMN     "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "provider" "PaymentProvider" NOT NULL,
ADD COLUMN     "providerRef" TEXT,
ADD COLUMN     "questionId" TEXT,
ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "type" "TransactionType" NOT NULL;

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "currency" TEXT NOT NULL,
    "customerId" TEXT,
    "connectedAccountId" TEXT,
    "status" "PaymentAccountStatus" NOT NULL DEFAULT 'PENDING',
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_userId_key" ON "payment_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_answerRequestId_key" ON "transactions"("answerRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_providerRef_key" ON "transactions"("providerRef");

-- CreateIndex
CREATE INDEX "transactions_payerId_status_idx" ON "transactions"("payerId", "status");

-- CreateIndex
CREATE INDEX "transactions_payeeId_status_idx" ON "transactions"("payeeId", "status");

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_answerRequestId_fkey" FOREIGN KEY ("answerRequestId") REFERENCES "answer_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

