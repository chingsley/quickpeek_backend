-- CreateTable
CREATE TABLE "question_responder_blocks" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "answerRequestId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "question_responder_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_responder_blocks_answerRequestId_key" ON "question_responder_blocks"("answerRequestId");

-- CreateIndex
CREATE INDEX "question_responder_blocks_questionId_idx" ON "question_responder_blocks"("questionId");

-- CreateIndex
CREATE INDEX "question_responder_blocks_questionId_responderId_idx" ON "question_responder_blocks"("questionId", "responderId");

-- AddForeignKey
ALTER TABLE "question_responder_blocks" ADD CONSTRAINT "question_responder_blocks_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_responder_blocks" ADD CONSTRAINT "question_responder_blocks_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_responder_blocks" ADD CONSTRAINT "question_responder_blocks_answerRequestId_fkey" FOREIGN KEY ("answerRequestId") REFERENCES "answer_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
