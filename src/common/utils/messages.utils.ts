import { MessageType } from '@prisma/client';
import prisma from '../../core/database/prisma/client';
import { emitToUser } from '../../core/socket/socket.server';

export const formatMessagePayload = (message: {
  id: string;
  questionId: string;
  senderId: string;
  text: string;
  type: MessageType;
  createdAt: Date;
  readAt: Date | null;
}) => ({
  id: message.id,
  questionId: message.questionId,
  senderId: message.senderId,
  text: message.text,
  type: message.type,
  createdAt: message.createdAt.toISOString(),
  readAt: message.readAt?.toISOString() ?? null,
});

export const createSystemMessage = async (opts: {
  questionId: string;
  senderId: string;
  text: string;
}) => {
  return prisma.message.create({
    data: {
      questionId: opts.questionId,
      senderId: opts.senderId,
      text: opts.text,
      type: MessageType.SYSTEM,
    },
  });
};

/**
 * Seeds the opening messages for a newly assigned question thread:
 * 1) full address, 2) the questioner's text (if different from the address).
 * Skips when the thread already has messages (e.g. reassign flows).
 */
export const createInitialQuestionerMessages = async (opts: {
  questionId: string;
  questionerId: string;
  address: string;
  bodyText: string;
  assignedResponderId: string;
}): Promise<void> => {
  const { questionId, questionerId, address, bodyText, assignedResponderId } = opts;

  const existingCount = await prisma.message.count({ where: { questionId } });
  if (existingCount > 0) {
    return;
  }

  const addressText = address.trim();
  const body = bodyText.trim();
  const texts = [addressText];

  if (body && body !== addressText) {
    texts.push(body);
  }

  for (const text of texts) {
    const message = await prisma.message.create({
      data: { questionId, senderId: questionerId, text },
    });

    emitToUser(assignedResponderId, 'message:new', formatMessagePayload(message));
  }
};
