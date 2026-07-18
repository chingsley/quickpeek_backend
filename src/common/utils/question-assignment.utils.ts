import { Question } from '@prisma/client';
import prisma from '../../core/database/prisma/client';
import redisClient from '../../core/config/redis';
import { emitToUser } from '../../core/socket/socket.server';
import { cancelQuestionTtr } from './ttr.utils';
import { createSystemMessage, formatMessagePayload } from './messages.utils';

export const DEFAULT_TTR_MS = parseInt(
  process.env.QUESTION_TIME_TO_RESPOND_MS || `${10 * 60 * 1000}`,
  10,
);

type AssignmentTiming = Pick<Question, 'status' | 'respondByAt'>;

export const isAssignmentTtrElapsed = (question: AssignmentTiming): boolean => {
  if ((question.status as string) !== 'ASSIGNED') {
    return false;
  }

  if (!question.respondByAt) {
    return false;
  }

  return Date.now() >= new Date(question.respondByAt).getTime();
};

export const hasResponderEngaged = async (
  questionId: string,
  assignedResponderId: string | null,
): Promise<boolean> => {
  if (!assignedResponderId) {
    return false;
  }

  const responderMessageCount = await prisma.message.count({
    where: {
      questionId,
      senderId: assignedResponderId,
      type: 'USER',
    },
  });

  return responderMessageCount > 0;
};

const emitQuestionExpired = (question: Question) => {
  const payload = {
    questionId: question.id,
    status: 'EXPIRED',
    expiredAt: new Date().toISOString(),
    text: question.text,
    address: question.address,
    latitude: question.latitude,
    longitude: question.longitude,
  };

  emitToUser(question.userId, 'question:expired', payload);

  if (question.assignedResponderId) {
    emitToUser(question.assignedResponderId, 'question:assignment-expired', {
      questionId: question.id,
      status: 'EXPIRED',
    });
  }
};

/**
 * If an ASSIGNED question is past its response window, flip it to EXPIRED.
 * Returns true when expired. Skips expiry when no window is set or the
 * responder has already sent a user message.
 */
export const expireAssignmentIfTtrElapsed = async (
  question: Question,
): Promise<boolean> => {
  if (!isAssignmentTtrElapsed(question)) {
    return false;
  }

  if (await hasResponderEngaged(question.id, question.assignedResponderId)) {
    await cancelQuestionTtr(question.id);
    await prisma.question.update({
      where: { id: question.id },
      data: { respondByAt: null },
    });
    return false;
  }

  await prisma.question.update({
    where: { id: question.id },
    data: {
      status: 'EXPIRED' as any,
      expiredAt: new Date(),
      claimedByUserId: null,
      claimedAt: null,
    },
  });

  await redisClient.del(`lock:question:${question.id}`);

  const systemMessage = await createSystemMessage({
    questionId: question.id,
    senderId: question.userId,
    text: 'Response window expired.',
  });

  const messagePayload = formatMessagePayload(systemMessage);
  if (question.assignedResponderId) {
    emitToUser(question.assignedResponderId, 'message:new', messagePayload);
  }
  emitToUser(question.userId, 'message:new', messagePayload);

  emitQuestionExpired(question);

  return true;
};
