-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('USER', 'SYSTEM');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "respondByAt" TIMESTAMP(3);
