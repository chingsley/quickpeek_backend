import { MessageType } from '@prisma/client';
import prisma from '../../core/database/prisma/client';
import { emitToUser } from '../../core/socket/socket.server';

export type MessagePayloadInput = {
  id: string;
  questionId: string;
  answerRequestId: string;
  senderId: string;
  text: string;
  type: MessageType;
  visibleToUserId: string | null;
  createdAt: Date;
  readAt: Date | null;
};

export const formatMessagePayload = (message: MessagePayloadInput) => ({
  id: message.id,
  questionId: message.questionId,
  answerRequestId: message.answerRequestId,
  senderId: message.senderId,
  text: message.text,
  type: message.type,
  visibleToUserId: message.visibleToUserId,
  createdAt: message.createdAt.toISOString(),
  readAt: message.readAt?.toISOString() ?? null,
});

/**
 * Creates a SYSTEM message in a request-scoped chat. When `visibleToUserId`
 * is provided, only that user sees the message; otherwise both participants do.
 *
 * Emits `message:new` to the appropriate recipients.
 */
export const createSystemMessage = async (opts: {
  questionId: string;
  answerRequestId: string;
  senderId: string;
  text: string;
  visibleToUserId?: string | null;
  recipientIds?: string[];
}) => {
  const message = await prisma.message.create({
    data: {
      questionId: opts.questionId,
      answerRequestId: opts.answerRequestId,
      senderId: opts.senderId,
      text: opts.text,
      type: MessageType.SYSTEM,
      visibleToUserId: opts.visibleToUserId ?? null,
    },
  });

  const payload = formatMessagePayload(message);
  const recipients =
    opts.recipientIds ??
    (opts.visibleToUserId ? [opts.visibleToUserId] : []);
  for (const recipientId of recipients) {
    emitToUser(recipientId, 'message:new', payload);
  }

  return message;
};

/**
 * Creates a USER message visible to both participants. Emits `message:new`
 * to all recipients (typically questioner + responder).
 */
export const createUserMessage = async (opts: {
  questionId: string;
  answerRequestId: string;
  senderId: string;
  text: string;
  recipientIds: string[];
}) => {
  const message = await prisma.message.create({
    data: {
      questionId: opts.questionId,
      answerRequestId: opts.answerRequestId,
      senderId: opts.senderId,
      text: opts.text,
      type: MessageType.USER,
      visibleToUserId: null,
    },
  });

  const payload = formatMessagePayload(message);
  for (const recipientId of opts.recipientIds) {
    emitToUser(recipientId, 'message:new', payload);
  }

  return message;
};

export type QuestionBriefingInput = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  detail: string;
  acceptanceCriteria: string;
};

/** Builds ordered briefing texts posted on behalf of the questioner after accept. */
export const buildAcceptanceBriefingTexts = (question: QuestionBriefingInput): string[] => {
  const texts: string[] = [];

  const address = question.address?.trim();
  if (address) {
    texts.push(`Location: ${address}`);
  } else if (question.latitude != null && question.longitude != null) {
    texts.push(`Location: ${question.latitude}, ${question.longitude}`);
  }

  const detail = question.detail?.trim();
  if (detail) {
    texts.push(detail);
  }

  const criteria = question.acceptanceCriteria?.trim();
  if (criteria) {
    texts.push(`Acceptance criteria: ${criteria}`);
  }

  return texts;
};

/**
 * After a request is accepted, auto-post the question briefing as USER messages
 * from the questioner (location, detail, acceptance criteria).
 */
export const createAcceptanceBriefingMessages = async (opts: {
  questionId: string;
  answerRequestId: string;
  questionerId: string;
  responderId: string;
  question: QuestionBriefingInput;
}) => {
  const texts = buildAcceptanceBriefingTexts(opts.question);
  const recipientIds = [opts.questionerId, opts.responderId];
  const messages = [];

  for (const text of texts) {
    const message = await createUserMessage({
      questionId: opts.questionId,
      answerRequestId: opts.answerRequestId,
      senderId: opts.questionerId,
      text,
      recipientIds,
    });
    messages.push(message);
  }

  return messages;
};
