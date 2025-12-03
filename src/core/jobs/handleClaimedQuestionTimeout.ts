import { PrismaClient, Question, User } from '@prisma/client';
import { Job } from 'bull';
import prisma from '../database/prisma/client';
import { broadcastQuestionUpdate } from '../socket/socket.server';
import redisClient from '../config/redis';


/**
 * 
 * @param job 
 */
const handleClaimedQuestionTimeout = async (job: Job) => {
  const { questionId, claimedByUserId } = job.data;

  const question = await prisma.question.findUnique({ where: { id: questionId } });

  // If question is still PENDING and owned by the same user, expire it
  if (question && question.status === 'PENDING_ANSWER' && question.claimedByUserId === claimedByUserId) {

    // 1. Reset Status
    await prisma.question.update({
      where: { id: questionId },
      data: {
        status: 'OPEN',
        claimedByUserId: null,
        claimedAt: null,
      },
    });

    // 2. Clear Redis Lock
    await redisClient.del(`lock:question:${questionId}`);

    // 3. Notify everyone via Socket that the question is open again
    broadcastQuestionUpdate(questionId, { status: 'OPEN' });

    console.log(`Claimed Question ${questionId} timed out.  Re-OPENED for all nearby users.`);
  }
};





export default handleClaimedQuestionTimeout;