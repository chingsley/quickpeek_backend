-- Enum values ASSIGNED / EXPIRED were added in the preceding migration
-- 20260708140000_add_question_status_enum_values.

-- AddColumn: assignment + TTR fields on questions
ALTER TABLE "questions" ADD COLUMN "assignedResponderId" TEXT;
ALTER TABLE "questions" ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "questions" ADD COLUMN "timeToRespondMs" INTEGER;
ALTER TABLE "questions" ADD COLUMN "expiredAt" TIMESTAMP(3);

-- AddColumn: image attachment on answers
ALTER TABLE "answers" ADD COLUMN "imageUrl" TEXT;

-- Backfill: any legacy PENDING_ANSWER questions are treated as ASSIGNED for the new model.
UPDATE "questions" SET "status" = 'ASSIGNED' WHERE "status" = 'PENDING_ANSWER';
-- Migrate legacy claim field into the new assignment field where applicable.
UPDATE "questions" SET "assignedResponderId" = "claimedByUserId" WHERE "claimedByUserId" IS NOT NULL AND "assignedResponderId" IS NULL;
UPDATE "questions" SET "assignedAt" = "claimedAt" WHERE "claimedAt" IS NOT NULL AND "assignedAt" IS NULL;

-- AddForeignKey: questions.assignedResponderId -> users.id
ALTER TABLE "questions" ADD CONSTRAINT "questions_assignedResponderId_fkey" FOREIGN KEY ("assignedResponderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: speed up queries filtering assigned questions per responder.
CREATE INDEX IF NOT EXISTS "questions_assignedResponderId_idx" ON "questions"("assignedResponderId");
CREATE INDEX IF NOT EXISTS "questions_status_idx" ON "questions"("status");
