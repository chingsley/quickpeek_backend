import { Question, QuestionStatus, ReviewerRole } from '@prisma/client';
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

export const getMessageCountsByRole = async (question: Question) => {
  const [questionerMsgCount, responderMsgCount] = await Promise.all([
    prisma.message.count({
      where: { questionId: question.id, senderId: question.userId },
    }),
    question.assignedResponderId
      ? prisma.message.count({
          where: { questionId: question.id, senderId: question.assignedResponderId },
        })
      : Promise.resolve(0),
  ]);

  return { questionerMsgCount, responderMsgCount };
};

export const getReviewUnlockReason = async (
  question: Question,
): Promise<ReviewUnlockReason> => {
  if (question.status === QuestionStatus.ANSWERED) {
    return 'marked_answered';
  }

  if (!question.assignedResponderId) {
    return null;
  }

  const { questionerMsgCount, responderMsgCount } = await getMessageCountsByRole(question);

  if (
    responderMsgCount >= REVIEW_ACTIVITY_RESPONDER_MIN &&
    questionerMsgCount >= REVIEW_ACTIVITY_QUESTIONER_MIN
  ) {
    return 'activity_threshold';
  }

  return null;
};

export const isReviewUnlocked = async (question: Question): Promise<boolean> => {
  const reason = await getReviewUnlockReason(question);
  return reason !== null;
};

export const revealReviewsForQuestion = async (questionId: string): Promise<void> => {
  const now = new Date();
  const hiddenReviews = await prisma.review.findMany({
    where: { questionId, isRevealed: false },
  });

  if (hiddenReviews.length === 0) {
    return;
  }

  await prisma.review.updateMany({
    where: { questionId, isRevealed: false },
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

export const tryRevealMutualReviews = async (questionId: string): Promise<boolean> => {
  const reviews = await prisma.review.findMany({ where: { questionId } });
  if (reviews.length < 2) {
    return false;
  }

  const hasQuestionerReview = reviews.some((r) => r.raterRole === ReviewerRole.QUESTIONER);
  const hasResponderReview = reviews.some((r) => r.raterRole === ReviewerRole.RESPONDER);

  if (!hasQuestionerReview || !hasResponderReview) {
    return false;
  }

  await revealReviewsForQuestion(questionId);
  return true;
};
