import { Job } from 'bull';
import prisma from '../database/prisma/client';
import { emitToUser } from '../socket/socket.server';
import redisClient from '../config/redis';

/**
 * Responder-Selection Flow: TTR (time-to-respond) timeout handler.
 *
 * If a question is still ASSIGNED to the same responder when the TTR window
 * elapses, we:
 *   1. Flip the status to EXPIRED (no longer actionable by the responder).
 *   2. Release the responder's TTR Redis lock.
 *   3. Emit `question:expired` to the questioner's `user:<id>` room so they
 *      can re-choose a responder (the questioner-side alert is handled by
 *      the frontend Task N9).
 *
 * Legacy `claimedByUserId` questions (PENDING_ANSWER) are handled the same way
 * for back-compat — they too move to EXPIRED rather than back to OPEN, since
 * the new model no longer exposes OPEN questions for race-to-claim.
 */
const handleClaimedQuestionTimeout = async (job: Job) => {
  const { questionId, assignedResponderId, claimedByUserId } = job.data as {
    questionId: string;
    assignedResponderId?: string;
    claimedByUserId?: string;
  };

  const question = await prisma.question.findUnique({ where: { id: questionId } });

  if (!question) return;

  const isStillAssignedToSameResponder =
    (question.status === ('ASSIGNED' as any)) &&
    assignedResponderId &&
    question.assignedResponderId === assignedResponderId;

  const isLegacyPendingForSameClaimer =
    (question.status === ('PENDING_ANSWER' as any)) &&
    claimedByUserId &&
    question.claimedByUserId === claimedByUserId;

  // Already answered / cancelled / reassigned in the meantime — do nothing.
  if (!isStillAssignedToSameResponder && !isLegacyPendingForSameClaimer) {
    return;
  }

  // 1. Flip status to EXPIRED + record expiry time.
  await prisma.question.update({
    where: { id: questionId },
    data: {
      status: 'EXPIRED' as any,
      expiredAt: new Date(),
      // Clear the responder/claimer fields so the question is unassigned.
      assignedResponderId: null,
      assignedAt: null,
      claimedByUserId: null,
      claimedAt: null,
    },
  });

  // 2. Release the TTR Redis lock.
  await redisClient.del(`lock:question:${questionId}`);

  // 3. Notify the questioner that the responder didn't respond in time, with
  //    enough context for the UI to offer a "Choose another responder" action.
  emitToUser(question.userId, 'question:expired', {
    questionId,
    status: 'EXPIRED',
    expiredAt: new Date().toISOString(),
    // Include the original question context so the frontend can pre-fill the
    // Browse Responders screen without an extra fetch.
    text: question.text,
    address: question.address,
    latitude: question.latitude,
    longitude: question.longitude,
  });

  if (assignedResponderId) {
    emitToUser(assignedResponderId, 'question:assignment-expired', {
      questionId,
    });
  }

  console.log(`Question ${questionId} TTR expired; questioner ${question.userId} notified.`);
};

export default handleClaimedQuestionTimeout;
