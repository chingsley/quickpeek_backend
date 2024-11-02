/*
  Warnings:

  - Added the required column `isVerified` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `locationSharingEnabled` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isVerified" BOOLEAN NOT NULL,
ADD COLUMN     "locationSharingEnabled" BOOLEAN NOT NULL;
