/*
  Warnings:

  - You are about to drop the column `locationId` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `answerId` on the `Rating` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Rating` table. All the data in the column will be lost.
  - You are about to drop the column `value` on the `Rating` table. All the data in the column will be lost.
  - You are about to drop the `Location` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `location` to the `Question` table without a default value. This is not possible if the table is not empty.
  - Added the required column `feedback` to the `Rating` table without a default value. This is not possible if the table is not empty.
  - Added the required column `questionerId` to the `Rating` table without a default value. This is not possible if the table is not empty.
  - Added the required column `responderId` to the `Rating` table without a default value. This is not possible if the table is not empty.
  - Made the column `questionId` on table `Rating` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `latitude` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `longitude` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_locationId_fkey";

-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_answerId_fkey";

-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_userId_fkey";

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "locationId",
ADD COLUMN     "location" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Rating" DROP COLUMN "answerId",
DROP COLUMN "userId",
DROP COLUMN "value",
ADD COLUMN     "feedback" TEXT NOT NULL,
ADD COLUMN     "questionerId" TEXT NOT NULL,
ADD COLUMN     "rating" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "responderId" TEXT NOT NULL,
ALTER COLUMN "questionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "latitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "longitude" DOUBLE PRECISION NOT NULL;

-- DropTable
DROP TABLE "Location";

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_questionerId_fkey" FOREIGN KEY ("questionerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
