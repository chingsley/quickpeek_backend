import { Question, User } from '@prisma/client';
import { Job } from 'bull';
import prisma from '../database/prisma/client';
import { sendNotification } from '../messaging/firebase.push';
import { emitToUser } from '../socket/socket.server';

type QuestionWithResponder = Question & {
  assignedResponder: Pick<User, 'id' | 'username' | 'deviceToken' | 'notificationsEnabled'> | null;
  user: Pick<User, 'id' | 'username'>;
};

/**
 * Targeted notification to the single responder the questioner selected.
 *
 * Emits `question:new` to exactly one `user:<responderId>` room, and sends
 * one FCM push if the responder has notifications enabled. If the responder
 * has notifications disabled we still emit the socket event so an online
 * responder sees the question in real time.
 */
const notifyAssignedResponder = async (job: Job) => {
  try {
    const { questionId, assignedResponderId } = job.data as {
      questionId: string;
      assignedResponderId: string;
    };

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        assignedResponder: {
          select: { id: true, username: true, deviceToken: true, notificationsEnabled: true },
        },
        user: { select: { id: true, username: true } },
      },
    }) as QuestionWithResponder | null;

    if (!question) {
      throw new Error(`Question ${questionId} not found`);
    }
    if (!question.assignedResponder || question.assignedResponder.id !== assignedResponderId) {
      // The assignment changed between enqueue and processing — do nothing.
      console.warn(
        `notifyAssignedResponder: responder mismatch for question ${questionId}; skipping`,
      );
      return;
    }

    const responder = question.assignedResponder;

    // 1. Targeted socket emit to the single responder.
    emitToUser(responder.id, 'question:new', {
      id: question.id,
      address: question.address,
      longitude: question.longitude,
      latitude: question.latitude,
      text: question.text,
      userId: question.userId,
      questionerUsername: question.user.username,
      status: question.status,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
      assignedResponderId: responder.id,
      assignedAt: question.assignedAt,
      timeToRespondMs: question.timeToRespondMs,
    });

    // 2. FCM push (best effort, only if enabled).
    if (!responder.notificationsEnabled) {
      console.log(`Responder ${responder.id} has notifications disabled; skipping push`);
      return;
    }

    const payload = {
      body: `${question.user.username} asked you a question: "${question.text}"`,
      data: {
        questionId: question.id,
        assignedResponderId: responder.id,
        timeToRespondMs: String(question.timeToRespondMs ?? ''),
      },
    };

    if (responder.deviceToken) {
      try {
        await sendNotification(responder.deviceToken, payload);
      } catch (err) {
        // Push failures are not fatal — the socket delivery already happened.
        console.error(`notifyAssignedResponder: push failed for ${responder.id}`, err);
      }
    }

    console.log(`Notified assigned responder ${responder.id} for question ${question.id}`);
  } catch (error) {
    console.error('notifyAssignedResponder failed', error);
  }
};

export default notifyAssignedResponder;
