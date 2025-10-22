-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('NEW', 'PENDING', 'RESOLVED');

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "status" "QuestionStatus" NOT NULL DEFAULT 'NEW';
