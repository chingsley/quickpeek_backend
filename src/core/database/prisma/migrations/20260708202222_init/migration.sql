/*
  Warnings:

  - The values [PENDING_ANSWER] on the enum `QuestionStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "QuestionStatus_new" AS ENUM ('OPEN', 'ASSIGNED', 'ANSWERED', 'EXPIRED', 'CANCELLED');
ALTER TABLE "questions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "questions" ALTER COLUMN "status" TYPE "QuestionStatus_new" USING ("status"::text::"QuestionStatus_new");
ALTER TYPE "QuestionStatus" RENAME TO "QuestionStatus_old";
ALTER TYPE "QuestionStatus_new" RENAME TO "QuestionStatus";
DROP TYPE "QuestionStatus_old";
ALTER TABLE "questions" ALTER COLUMN "status" SET DEFAULT 'OPEN';
COMMIT;

-- DropIndex
DROP INDEX "questions_assignedResponderId_idx";

-- DropIndex
DROP INDEX "questions_status_idx";
