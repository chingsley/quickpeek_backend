import { AnswerRequest, AnswerRequestStatus, Question, ReviewerRole } from '@prisma/client';
import prisma from '../../core/database/prisma/client';
import { getReviewRevealWindowDays } from '../../modules/config/configService';
import { RatingRole } from '@prisma/client';
import { recomputeUserRatingAggregate } from './ratings';

export const REVIEW_ACTIVITY_RESPONDER_MIN = 4;
export const REVIEW_ACTIVITY_QUESTIONER_MIN = 3;

export type ReviewUnlockReason = 'marked_answered' | 'activity_threshold' | null;

type RequestWithQuestion = {
  id: string;
  status: AnswerRequestStatus;
  questionerId: string;
  responderId: string;
  question: Pick<Question, 'id' | 'status' | 'answeredAt'>;
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
 * Review unlock rules:
 *   - request is ACCEPTED and question was closed as answered (answeredAt set), OR
 *   - activity threshold (4 responder + 3 questioner messages) met.
 */
export const getReviewUnlockReason = async (
  request: RequestWithQuestion,
): Promise<ReviewUnlockReason> => {
  if (request.status !== AnswerRequestStatus.ACCEPTED) {
    return null;
  }

  if (request.question.answeredAt != null) {
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

const getReviewWindowMs = async (): Promise<number> => {
  const days = await getReviewRevealWindowDays();
  return days * 24 * 60 * 60 * 1000;
};

const getActivityThresholdUnlockAt = async (request: RequestWithQuestion): Promise<Date | null> => {
  const [responderMsgs, questionerMsgs] = await Promise.all([
    prisma.message.findMany({
      where: { answerRequestId: request.id, senderId: request.responderId },
      orderBy: { createdAt: 'asc' },
      take: REVIEW_ACTIVITY_RESPONDER_MIN,
      select: { createdAt: true },
    }),
    prisma.message.findMany({
      where: { answerRequestId: request.id, senderId: request.questionerId },
      orderBy: { createdAt: 'asc' },
      take: REVIEW_ACTIVITY_QUESTIONER_MIN,
      select: { createdAt: true },
    }),
  ]);

  if (
    responderMsgs.length < REVIEW_ACTIVITY_RESPONDER_MIN ||
    questionerMsgs.length < REVIEW_ACTIVITY_QUESTIONER_MIN
  ) {
    return null;
  }

  const responderThresholdAt = responderMsgs[REVIEW_ACTIVITY_RESPONDER_MIN - 1].createdAt;
  const questionerThresholdAt = questionerMsgs[REVIEW_ACTIVITY_QUESTIONER_MIN - 1].createdAt;
  return responderThresholdAt > questionerThresholdAt ? responderThresholdAt : questionerThresholdAt;
};

/** When reviews became available for this request (answered mark or activity threshold). */
export const getReviewUnlockAt = async (request: RequestWithQuestion): Promise<Date | null> => {
  const reason = await getReviewUnlockReason(request);
  if (!reason) {
    return null;
  }

  if (reason === 'marked_answered') {
    return request.question.answeredAt;
  }

  return getActivityThresholdUnlockAt(request);
};

export const getReviewWindowEndsAt = async (request: RequestWithQuestion): Promise<Date | null> => {
  const unlockAt = await getReviewUnlockAt(request);
  if (!unlockAt) {
    return null;
  }

  return new Date(unlockAt.getTime() + (await getReviewWindowMs()));
};

export const isReviewWindowOpen = async (request: RequestWithQuestion): Promise<boolean> => {
  const endsAt = await getReviewWindowEndsAt(request);
  if (!endsAt) {
    return false;
  }

  return Date.now() < endsAt.getTime();
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
