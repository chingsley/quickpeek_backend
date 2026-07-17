/*
  Warnings:

  - You are about to drop the column `answersCount` on the `user_ratings` table. All the data in the column will be lost.
  - You are about to drop the column `totalRating` on the `user_ratings` table. All the data in the column will be lost.
  - You are about to drop the `answer_ratings` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,role]` on the table `user_ratings` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `reviewsCount` to the `user_ratings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `role` to the `user_ratings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalStars` to the `user_ratings` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReviewerRole" AS ENUM ('QUESTIONER', 'RESPONDER');

-- CreateEnum
CREATE TYPE "RatingRole" AS ENUM ('AS_RESPONDER', 'AS_QUESTIONER');

-- DropForeignKey
ALTER TABLE "answer_ratings" DROP CONSTRAINT "answer_ratings_answerId_fkey";

-- DropIndex
DROP INDEX "user_ratings_userId_key";

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "answeredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_ratings" DROP COLUMN "answersCount",
DROP COLUMN "totalRating",
ADD COLUMN     "reviewsCount" INTEGER NOT NULL,
ADD COLUMN     "role" "RatingRole" NOT NULL,
ADD COLUMN     "totalStars" INTEGER NOT NULL;

-- DropTable
DROP TABLE "answer_ratings";

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "rateeId" TEXT NOT NULL,
    "raterRole" "ReviewerRole" NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "isRevealed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_questionId_idx" ON "messages"("questionId");

-- CreateIndex
CREATE INDEX "reviews_rateeId_isRevealed_idx" ON "reviews"("rateeId", "isRevealed");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_questionId_raterId_key" ON "reviews"("questionId", "raterId");

-- CreateIndex
CREATE UNIQUE INDEX "user_ratings_userId_role_key" ON "user_ratings"("userId", "role");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rateeId_fkey" FOREIGN KEY ("rateeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
