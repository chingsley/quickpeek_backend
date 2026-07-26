import { Job } from 'bull';
import { QuestionStatus } from '@prisma/client';
import prisma from '../database/prisma/client';

/**
 * Periodic cleanup of stale OPEN questions.
 *
 * Closes OPEN questions older than `QUESTION_DRAFT_TTL_HOURS` (default 24h).
 * (Under the request-to-answer model there is no EXPIRED state and no per-question
 * TTR timeout, so this is a single best-effort GC pass.)
 */
const cleanupQuestions = async (_job: Job) => {
  const draftTtlHours = parseInt(process.env.QUESTION_DRAFT_TTL_HOURS || '24', 10);
  const cutoff = new Date(Date.now() - draftTtlHours * 60 * 60 * 1000);

  const now = new Date();
  const result = await prisma.question.updateMany({
    where: {
      status: QuestionStatus.OPEN,
      createdAt: { lt: cutoff },
    },
    data: {
      status: QuestionStatus.CLOSED,
      closeReason: 'Automatically closed (expired)',
      closedAt: now,
    },
  });

  console.log(`questionCleanup: closed ${result.count} stale OPEN questions`);
};

export default cleanupQuestions;
