import { MessageType, QuestionStatus } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import redisClient from '../../../core/config/redis';
import { emitToUser } from '../../../core/socket/socket.server';
import { hasResponderEngaged } from '../../../common/utils/question-assignment.utils';
import {
  createSystemMessage,
  formatMessagePayload,
} from '../../../common/utils/messages.utils';
import { formatResponseWindowLabel } from '../../../common/utils/response-window.utils';
import { questionTimeoutQueue } from '../../../core/queues/questionTimeoutQueue';
import { cancelQuestionTtr } from '../../../common/utils/ttr.utils';

const cancelPendingTimeoutJobs = async (questionId: string) => {
  const pendingJobs = await questionTimeoutQueue.getJobs(['delayed', 'waiting'], 0, 200);
  await Promise.all(
    pendingJobs
      .filter((job) => job.data?.questionId === questionId)
      .map((job) => job.remove()),
  );
};

export const setResponseWindow = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;
    const { timeToRespondMs } = req.body;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        user: { select: { id: true, name: true, username: true } },
      },
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (question.userId !== userId) {
      return res.status(403).json({ error: 'Only the questioner can set the response window' });
    }

    if (question.status !== QuestionStatus.ASSIGNED) {
      return res.status(409).json({ error: 'Response window can only be set for assigned questions' });
    }

    if (!question.assignedResponderId) {
      return res.status(409).json({ error: 'No responder assigned to this question' });
    }

    if (await hasResponderEngaged(questionId, question.assignedResponderId)) {
      return res.status(409).json({
        error: 'Cannot set a response window after the responder has already replied',
      });
    }

    const now = new Date();
    const respondByAt = new Date(now.getTime() + timeToRespondMs);
    const responderId = question.assignedResponderId;

    await cancelPendingTimeoutJobs(questionId);
    await cancelQuestionTtr(questionId);

    const lockKey = `lock:question:${questionId}`;
    await redisClient.set(lockKey, responderId, 'PX', timeToRespondMs, 'NX');

    const updated = await prisma.question.update({
      where: { id: questionId },
      data: {
        timeToRespondMs,
        respondByAt,
        expiredAt: null,
      },
    });

    await questionTimeoutQueue.add(
      { questionId, assignedResponderId: responderId },
      { delay: timeToRespondMs },
    );

    const questionerName = question.user?.name || question.user?.username || 'Questioner';
    const windowLabel = formatResponseWindowLabel(timeToRespondMs);
    const systemMessage = await createSystemMessage({
      questionId,
      senderId: userId,
      text: `${questionerName} set a ${windowLabel} response window.`,
    });

    const messagePayload = formatMessagePayload(systemMessage);
    emitToUser(responderId, 'message:new', messagePayload);
    emitToUser(userId, 'message:new', messagePayload);

    const windowPayload = {
      questionId,
      respondByAt: respondByAt.toISOString(),
      timeToRespondMs,
      status: QuestionStatus.ASSIGNED,
    };
    emitToUser(userId, 'question:window-set', windowPayload);
    emitToUser(responderId, 'question:window-set', windowPayload);

    return res.status(200).json({
      message: 'Response window set',
      data: {
        ...updated,
        respondByAt: updated.respondByAt?.toISOString() ?? null,
        systemMessage: messagePayload,
      },
    });
  } catch (error) {
    console.error('setResponseWindow error:', error);
    return res.status(500).json({ error: 'Failed to set response window' });
  }
};
