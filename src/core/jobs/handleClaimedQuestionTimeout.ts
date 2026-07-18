import { Job } from 'bull';
import prisma from '../database/prisma/client';
import redisClient from '../config/redis';
import {
  hasResponderEngaged,
  isAssignmentTtrElapsed,
} from '../../common/utils/question-assignment.utils';
import {
  createSystemMessage,
  formatMessagePayload,
} from '../../common/utils/messages.utils';
import { emitToUser } from '../socket/socket.server';

const handleClaimedQuestionTimeout = async (job: Job) => {
  const { questionId, assignedResponderId, claimedByUserId } = job.data as {
    questionId: string;
    assignedResponderId?: string;
    claimedByUserId?: string;
  };

  const question = await prisma.question.findUnique({ where: { id: questionId } });

  if (!question) return;

  const isStillAssignedToSameResponder =
    question.status === ('ASSIGNED' as any) &&
    assignedResponderId &&
    question.assignedResponderId === assignedResponderId;

  const isLegacyPendingForSameClaimer =
    (question.status as any) === 'PENDING_ANSWER' &&
    claimedByUserId &&
    question.claimedByUserId === claimedByUserId;

  if (!isStillAssignedToSameResponder && !isLegacyPendingForSameClaimer) {
    return;
  }

  if (!isAssignmentTtrElapsed(question)) {
    return;
  }

  if (
    assignedResponderId &&
    (await hasResponderEngaged(questionId, assignedResponderId))
  ) {
    await redisClient.del(`lock:question:${questionId}`);
    await prisma.question.update({
      where: { id: questionId },
      data: { respondByAt: null },
    });
    return;
  }

  await prisma.question.update({
    where: { id: questionId },
    data: {
      status: 'EXPIRED' as any,
      expiredAt: new Date(),
      claimedByUserId: null,
      claimedAt: null,
    },
  });

  await redisClient.del(`lock:question:${questionId}`);

  const systemMessage = await createSystemMessage({
    questionId,
    senderId: question.userId,
    text: 'Response window expired.',
  });

  const messagePayload = formatMessagePayload(systemMessage);
  if (assignedResponderId) {
    emitToUser(assignedResponderId, 'message:new', messagePayload);
  }
  emitToUser(question.userId, 'message:new', messagePayload);

  emitToUser(question.userId, 'question:expired', {
    questionId,
    status: 'EXPIRED',
    expiredAt: new Date().toISOString(),
    text: question.text,
    address: question.address,
    latitude: question.latitude,
    longitude: question.longitude,
  });

  if (assignedResponderId) {
    emitToUser(assignedResponderId, 'question:assignment-expired', {
      questionId,
      status: 'EXPIRED',
    });
  }

  console.log(`Question ${questionId} response window expired.`);
};

export default handleClaimedQuestionTimeout;
