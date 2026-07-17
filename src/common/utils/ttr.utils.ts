import prisma from '../../core/database/prisma/client';
import redisClient from '../../core/config/redis';
import { questionTimeoutQueue } from '../../core/queues/questionTimeoutQueue';

export const cancelQuestionTtr = async (questionId: string): Promise<void> => {
  try {
    await redisClient.del(`lock:question:${questionId}`);
  } catch (err) {
    console.error('Failed to release TTR lock:', err);
  }

  try {
    const pendingJobs = await questionTimeoutQueue.getJobs(['delayed', 'waiting'], 0, 200);
    await Promise.all(
      pendingJobs
        .filter((job) => job.data?.questionId === questionId)
        .map((job) => job.remove()),
    );
  } catch (err) {
    console.error('Failed to cancel timeout job:', err);
  }
};

export const cancelTtrOnFirstResponderMessage = async (
  questionId: string,
  senderId: string,
  assignedResponderId: string | null,
): Promise<boolean> => {
  if (!assignedResponderId || senderId !== assignedResponderId) {
    return false;
  }

  const priorResponderMessages = await prisma.message.count({
    where: {
      questionId,
      senderId: assignedResponderId,
      type: 'USER',
    },
  });

  if (priorResponderMessages > 1) {
    return false;
  }

  await cancelQuestionTtr(questionId);
  await prisma.question.update({
    where: { id: questionId },
    data: { respondByAt: null },
  });
  return true;
};
