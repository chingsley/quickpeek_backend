import { Question } from '@prisma/client';
import prisma from '../../core/database/prisma/client';
import redisClient from '../../core/config/redis';
import { emitToUser } from '../../core/socket/socket.server';

export const DEFAULT_TTR_MS = parseInt(
  process.env.QUESTION_TIME_TO_RESPOND_MS || `${10 * 60 * 1000}`,
  10,
);

type AssignmentTiming = Pick<Question, 'status' | 'assignedAt' | 'timeToRespondMs'>;

export const isAssignmentTtrElapsed = (question: AssignmentTiming): boolean => {
  if ((question.status as string) !== 'ASSIGNED') {
    return false;
  }

  if (!question.assignedAt) {
    return false;
  }

  const ttrMs = question.timeToRespondMs ?? DEFAULT_TTR_MS;
  const deadline = new Date(question.assignedAt).getTime() + ttrMs;
  return Date.now() >= deadline;
};

/**
 * If an ASSIGNED question is past its TTR window, flip it to EXPIRED using the
 * same side-effects as the Bull timeout job. Returns true when expired.
 */
export const expireAssignmentIfTtrElapsed = async (
  question: Question,
): Promise<boolean> => {
  if (!isAssignmentTtrElapsed(question)) {
    return false;
  }

  await prisma.question.update({
    where: { id: question.id },
    data: {
      status: 'EXPIRED' as any,
      expiredAt: new Date(),
      assignedResponderId: null,
      assignedAt: null,
      claimedByUserId: null,
      claimedAt: null,
    },
  });

  await redisClient.del(`lock:question:${question.id}`);

  const responderId = question.assignedResponderId;

  emitToUser(question.userId, 'question:expired', {
    questionId: question.id,
    status: 'EXPIRED',
    expiredAt: new Date().toISOString(),
    text: question.text,
    address: question.address,
    latitude: question.latitude,
    longitude: question.longitude,
  });

  if (responderId) {
    emitToUser(responderId, 'question:assignment-expired', {
      questionId: question.id,
    });
  }

  return true;
};
