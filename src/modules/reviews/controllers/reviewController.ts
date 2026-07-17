import { Request, Response } from 'express';
import { QuestionStatus, ReviewerRole } from '@prisma/client';
import prisma from '../../../core/database/prisma/client';
import { emitToUser } from '../../../core/socket/socket.server';
import {
  getReviewUnlockReason,
  isReviewUnlocked,
  tryRevealMutualReviews,
} from '../../../common/utils/reviews.utils';

export const getReviewEligibility = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const isQuestioner = question.userId === userId;
    const isResponder = question.assignedResponderId === userId;

    if (!isQuestioner && !isResponder) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const unlockedReason = await getReviewUnlockReason(question);
    const unlocked = unlockedReason !== null;

    const existingReview = await prisma.review.findUnique({
      where: { questionId_raterId: { questionId, raterId: userId } },
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

export const submitReview = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;
    const { stars, comment } = req.body;

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const isQuestioner = question.userId === userId;
    const isResponder = question.assignedResponderId === userId;

    if (!isQuestioner && !isResponder) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    if (!(await isReviewUnlocked(question))) {
      return res.status(409).json({ error: 'Reviews are not unlocked for this question yet' });
    }

    const raterRole = isQuestioner ? ReviewerRole.QUESTIONER : ReviewerRole.RESPONDER;
    const rateeId = isQuestioner
      ? question.assignedResponderId!
      : question.userId;

    const review = await prisma.review.upsert({
      where: { questionId_raterId: { questionId, raterId: userId } },
      create: {
        questionId,
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

    const revealed = await tryRevealMutualReviews(questionId);

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

export const markQuestionAnswered = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (question.userId !== userId) {
      return res.status(403).json({ error: 'Only the questioner can mark this question as answered' });
    }

    if (question.status === QuestionStatus.EXPIRED) {
      return res.status(409).json({ error: 'Cannot mark an expired question as answered' });
    }

    if (question.status === QuestionStatus.ANSWERED) {
      return res.status(200).json({ message: 'Question already marked as answered', data: question });
    }

    const now = new Date();
    const updated = await prisma.question.update({
      where: { id: questionId },
      data: {
        status: QuestionStatus.ANSWERED,
        answeredAt: now,
      },
    });

    const payload = {
      questionId,
      status: QuestionStatus.ANSWERED,
      answeredAt: now.toISOString(),
    };

    if (question.assignedResponderId) {
      emitToUser(question.assignedResponderId, 'question:update', payload);
    }
    emitToUser(question.userId, 'question:update', payload);

    return res.status(200).json({
      message: 'Question marked as answered',
      data: updated,
    });
  } catch (error) {
    console.error('markQuestionAnswered error:', error);
    return res.status(500).json({ error: 'Failed to mark question as answered' });
  }
};

export const getMyReviewForQuestion = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;

    const review = await prisma.review.findUnique({
      where: { questionId_raterId: { questionId, raterId: userId } },
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
    console.error('getMyReviewForQuestion error:', error);
    return res.status(500).json({ error: 'Failed to fetch review' });
  }
};
