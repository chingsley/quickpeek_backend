import { AnswerRequest, AnswerRequestStatus, Question, QuestionStatus, ReviewerRole } from '@prisma/client';
import prisma from '../../core/database/prisma/client';
import { RatingRole } from '@prisma/client';
import { recomputeUserRatingAggregate } from './ratings';

export const REVIEW_ACTIVITY_RESPONDER_MIN = 4;
export const REVIEW_ACTIVITY_QUESTIONER_MIN = 3;
export const REVIEW_REVEAL_WINDOW_DAYS = parseInt(
  process.env.REVIEW_REVEAL_WINDOW_DAYS || '14',
  10,
);

export type ReviewUnlockReason = 'marked_answered' | 'activity_threshold' | null;

type RequestWithQuestion = {
  id: string;
  status: AnswerRequestStatus;
  questionerId: string;
  responderId: string;
  question: Pick<Question, 'id' | 'status'>;
};

const getMessageCountsByRole = async (request: RequestWithQuestion) => {
  const [questionerMsgCount, responderMsgCount] = await Promise.all([
    prisma.message.count({
      where: { answerRequestId: request.id, senderId: request.questionerId },
    }),
    prisma.message.count({
      where: { answerRequestId: request.id, senderId: request.responderId },
    }),
  ]);

  return { questionerMsgCount, responderMsgCount };
};

/**
 * Review unlock rules (per marketplace request):
 *   - request is ACCEPTED and question is ANSWERED, OR
 *   - activity threshold (4 responder + 3 questioner messages) met.
 */
export const getReviewUnlockReason = async (
  request: RequestWithQuestion,
): Promise<ReviewUnlockReason> => {
  if (request.status !== AnswerRequestStatus.ACCEPTED) {
    return null;
  }

  if (request.question.status === QuestionStatus.ANSWERED) {
    return 'marked_answered';
  }

  const { questionerMsgCount, responderMsgCount } = await getMessageCountsByRole(request);
  if (
    responderMsgCount >= REVIEW_ACTIVITY_RESPONDER_MIN &&
    questionerMsgCount >= REVIEW_ACTIVITY_QUESTIONER_MIN
  ) {
    return 'activity_threshold';
  }

  return null;
};

export const isReviewUnlocked = async (request: RequestWithQuestion): Promise<boolean> => {
  const reason = await getReviewUnlockReason(request);
  return reason !== null;
};

export const revealReviewsForRequest = async (answerRequestId: string): Promise<void> => {
  const now = new Date();
  const hiddenReviews = await prisma.review.findMany({
    where: { answerRequestId, isRevealed: false },
  });

  if (hiddenReviews.length === 0) {
    return;
  }

  await prisma.review.updateMany({
    where: { answerRequestId, isRevealed: false },
    data: { isRevealed: true, revealedAt: now },
  });

  const rateeIds = new Set(hiddenReviews.map((review) => review.rateeId));
  for (const rateeId of rateeIds) {
    const roles = hiddenReviews
      .filter((review) => review.rateeId === rateeId)
      .map((review) =>
        review.raterRole === ReviewerRole.QUESTIONER
          ? RatingRole.AS_RESPONDER
          : RatingRole.AS_QUESTIONER,
      );

    for (const role of new Set(roles)) {
      await recomputeUserRatingAggregate(rateeId, role);
    }
  }
};

export const tryRevealMutualReviews = async (answerRequestId: string): Promise<boolean> => {
  const reviews = await prisma.review.findMany({ where: { answerRequestId } });
  if (reviews.length < 2) {
    return false;
  }

  const hasQuestionerReview = reviews.some((r) => r.raterRole === ReviewerRole.QUESTIONER);
  const hasResponderReview = reviews.some((r) => r.raterRole === ReviewerRole.RESPONDER);

  if (!hasQuestionerReview || !hasResponderReview) {
    return false;
  }

  await revealReviewsForRequest(answerRequestId);
  return true;
};

/** Keep the legacy alias alive for any callers that still expect the old name. */
export const revealReviewsForQuestion = revealReviewsForRequest;
