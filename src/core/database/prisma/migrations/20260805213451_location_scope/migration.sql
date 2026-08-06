-- CreateEnum
CREATE TYPE "LocationScope" AS ENUM ('EXACT_SPOT', 'WALKING', 'NEIGHBOURHOOD', 'CITY', 'ANYWHERE');

-- AlterTable
ALTER TABLE "questions" DROP COLUMN "restrictToNearby",
ADD COLUMN     "locationScope" "LocationScope" NOT NULL DEFAULT 'ANYWHERE';

