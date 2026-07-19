import { AnswerRequestStatus, QuestionStatus, ReviewerRole } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import {
  getReviewUnlockReason,
  isReviewUnlocked,
  tryRevealMutualReviews,
} from '../../../common/utils/reviews.utils';

type AuthedRequest = Request & { user?: { userId: string } };

const getRequestWithQuestion = async (requestId: string) =>
  prisma.answerRequest.findUnique({
    where: { id: requestId },
    include: {
      question: { select: { id: true, status: true, userId: true } },
    },
  });

type RequestWithQuestion = Awaited<ReturnType<typeof getRequestWithQuestion>>;

const assertReviewParticipant = (
  request: RequestWithQuestion,
  userId: string,
): { ok: true } | { ok: false; status: number; error: string } => {
  if (!request) {
    return { ok: false, status: 404, error: 'Request not found' };
  }
  if (request.responderId !== userId && request.questionerId !== userId) {
    return { ok: false, status: 403, error: 'Not a participant in this request' };
  }
  return { ok: true };
};

/**
 * GET /requests/:id/review-eligibility
 * Eligibility to review a request: must be a participant, request must be
 * ACCEPTED, and the question must be ANSWERED (or activity threshold met).
 */
export const getReviewEligibility = async (req: AuthedRequest, res: Response) => {
  try {
    const { id: requestId } = req.params;
    const userId = req.user!.userId;

    const request = await getRequestWithQuestion(requestId);
    const guard = assertReviewParticipant(request, userId);
    if (!guard.ok) {
      return res.status(guard.status).json({ error: guard.error });
    }

    const unlockedReason = await getReviewUnlockReason(request!);
    const unlocked = unlockedReason !== null;

    const existingReview = await prisma.review.findUnique({
      where: { answerRequestId_raterId: { answerRequestId: requestId, raterId: userId } },
    });

    return res.status(200).json({
      message: 'Successful',
      data: {
        canReview: unlocked && !existingReview,
        alreadyReviewed: !!existingReview,
        reviewSubmitted: !!existingReview,
        reviewRevealed: existingReview?.isRevealed ?? false,
        unlockedReason,
        unlocked,
      },
    });
  } catch (error) {
    console.error('getReviewEligibility error:', error);
    return res.status(500).json({ error: 'Failed to check review eligibility' });
  }
};

/**
 * POST /requests/:id/reviews
 * Submit (or update) a review for this request. Double-blind: revealed only
 * once both parties have submitted.
 */
export const submitReview = async (req: AuthedRequest, res: Response) => {
  try {
    const { id: requestId } = req.params;
    const userId = req.user!.userId;
    const { stars, comment } = req.body;

    const request = await getRequestWithQuestion(requestId);
    const guard = assertReviewParticipant(request, userId);
    if (!guard.ok) {
      return res.status(guard.status).json({ error: guard.error });
    }

    if (!(await isReviewUnlocked(request!))) {
      return res.status(409).json({ error: 'Reviews are not unlocked for this request yet' });
    }

    const isQuestioner = request!.questionerId === userId;
    const raterRole = isQuestioner ? ReviewerRole.QUESTIONER : ReviewerRole.RESPONDER;
    const rateeId = isQuestioner ? request!.responderId : request!.questionerId;

    const review = await prisma.review.upsert({
      where: { answerRequestId_raterId: { answerRequestId: requestId, raterId: userId } },
      create: {
        answerRequestId: requestId,
        raterId: userId,
        rateeId,
        raterRole,
        stars,
        comment: comment?.trim() || null,
        isRevealed: false,
      },
      update: {
        stars,
        comment: comment?.trim() || null,
      },
    });

    const revealed = await tryRevealMutualReviews(requestId);

    return res.status(201).json({
      message: revealed ? 'Review submitted and revealed' : 'Review submitted',
      data: {
        id: review.id,
        stars: review.stars,
        comment: review.comment,
        isRevealed: revealed || review.isRevealed,
        revealed,
      },
    });
  } catch (error) {
    console.error('submitReview error:', error);
    return res.status(500).json({ error: 'Failed to submit review' });
  }
};

/**
 * GET /requests/:id/my-review
 * Returns the caller's own review for this request (if any).
 */
export const getMyReviewForRequest = async (req: AuthedRequest, res: Response) => {
  try {
    const { id: requestId } = req.params;
    const userId = req.user!.userId;

    const review = await prisma.review.findUnique({
      where: { answerRequestId_raterId: { answerRequestId: requestId, raterId: userId } },
    });

    return res.status(200).json({
      message: 'Successful',
      data: review
        ? {
            id: review.id,
            stars: review.stars,
            comment: review.comment,
            isRevealed: review.isRevealed,
            createdAt: review.createdAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error('getMyReviewForRequest error:', error);
    return res.status(500).json({ error: 'Failed to fetch review' });
  }
};

export { AnswerRequestStatus, QuestionStatus };
