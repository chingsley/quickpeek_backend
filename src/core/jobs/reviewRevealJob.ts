import { Job } from 'bull';
import prisma from '../database/prisma/client';
import { revealReviewsForRequest, REVIEW_REVEAL_WINDOW_DAYS } from '../../common/utils/reviews.utils';

const processReviewReveal = async (_job: Job) => {
  try {
    const cutoff = new Date(Date.now() - REVIEW_REVEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const staleReviews = await prisma.review.findMany({
      where: {
        isRevealed: false,
        createdAt: { lte: cutoff },
      },
      select: { answerRequestId: true },
      distinct: ['answerRequestId'],
    });

    for (const row of staleReviews) {
      await revealReviewsForRequest(row.answerRequestId);
    }

    if (staleReviews.length > 0) {
      console.log(`Revealed reviews for ${staleReviews.length} request(s)`);
    }
  } catch (error) {
    console.error('processReviewReveal failed', error);
  }
};

export default processReviewReveal;
