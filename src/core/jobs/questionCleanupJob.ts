import { Job } from 'bull';
import prisma from '../database/prisma/client';

/**
 * Periodic cleanup of stale questions.
 *
 * Marks old questions as CANCELLED so they no longer surface in any view:
 *   - OPEN drafts older than `QUESTION_DRAFT_TTL_HOURS` (default 24h) that the
 *     questioner never assigned.
 *   - EXPIRED questions older than `QUESTION_EXPIRED_TTL_HOURS` (default 7d).
 *
 * This is a best-effort GC pass; the per-question TTR timeout
 * (handleClaimedQuestionTimeout) is what flips ASSIGNED -> EXPIRED.
 */
const cleanupQuestions = async (_job: Job) => {
  const draftTtlHours = parseInt(process.env.QUESTION_DRAFT_TTL_HOURS || '24', 10);
  const expiredTtlHours = parseInt(process.env.QUESTION_EXPIRED_TTL_HOURS || `${7 * 24}`, 10);

  const draftCutoff = new Date(Date.now() - draftTtlHours * 60 * 60 * 1000);
  const expiredCutoff = new Date(Date.now() - expiredTtlHours * 60 * 60 * 1000);

  // Cancel stale OPEN drafts.
  const draftResult = await prisma.question.updateMany({
    where: {
      status: 'OPEN' as any,
      createdAt: { lt: draftCutoff },
    },
    data: { status: 'CANCELLED' as any },
  });

  // Cancel stale EXPIRED questions.
  const expiredResult = await prisma.question.updateMany({
    where: {
      status: 'EXPIRED' as any,
      expiredAt: { lt: expiredCutoff },
    },
    data: { status: 'CANCELLED' as any },
  });

  console.log(
    `questionCleanup: cancelled ${draftResult.count} stale drafts and ${expiredResult.count} stale expired questions`,
  );
};

export default cleanupQuestions;
