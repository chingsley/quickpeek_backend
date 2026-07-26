-- Add close metadata columns
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "closeReason" TEXT;

-- Replace enum (PostgreSQL cannot drop enum values directly)
CREATE TYPE "QuestionStatus_new" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "questions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "questions" ALTER COLUMN "status" TYPE "QuestionStatus_new" USING (
  CASE
    WHEN "status"::text IN ('ANSWERED', 'CANCELLED') THEN 'CLOSED'::"QuestionStatus_new"
    ELSE "status"::text::"QuestionStatus_new"
  END
);

UPDATE "questions"
SET
  "closeReason" = CASE
    WHEN "answeredAt" IS NOT NULL THEN 'Question answered'
    ELSE 'Question closed'
  END,
  "closedAt" = COALESCE("answeredAt", "updatedAt")
WHERE "status" = 'CLOSED' AND "closedAt" IS NULL;

ALTER TYPE "QuestionStatus" RENAME TO "QuestionStatus_old";
ALTER TYPE "QuestionStatus_new" RENAME TO "QuestionStatus";
DROP TYPE "QuestionStatus_old";
ALTER TABLE "questions" ALTER COLUMN "status" SET DEFAULT 'OPEN';
