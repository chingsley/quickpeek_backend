import { AnswerRequestStatus, MessageType } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import { emitToUser } from '../../../core/socket/socket.server';
import { formatMessagePayload } from '../../../common/utils/messages.utils';

type AuthedRequest = Request & { user?: { userId: string } };

const REQUEST_PARTICIPANTS_SELECT = {
  id: true,
  questionId: true,
  responderId: true,
  questionerId: true,
  status: true,
  question: {
    select: {
      id: true,
      title: true,
      detail: true,
      userId: true,
      status: true,
      latitude: true,
      longitude: true,
      address: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  },
} as const;

const getRequest = async (requestId: string) =>
  prisma.answerRequest.findUnique({
    where: { id: requestId },
    select: REQUEST_PARTICIPANTS_SELECT,
  });

type RequestRow = Awaited<ReturnType<typeof getRequest>>;

const assertParticipant = (
  request: RequestRow,
  userId: string,
): { ok: true } | { ok: false; status: number; error: string } => {
  if (!request) {
    return { ok: false, status: 404, error: 'Request not found' };
  }
  if (request.responderId !== userId && request.questionerId !== userId) {
    return { ok: false, status: 403, error: 'Not a participant in this conversation' };
  }
  return { ok: true };
};

const counterpartyIdOf = (request: NonNullable<RequestRow>, userId: string) =>
  userId === request.questionerId ? request.responderId : request.questionerId;

/**
 * GET /requests/:id/messages
 * Returns messages visible to the caller (null visibleToUserId = both, or matches caller).
 */
export const getMessages = async (req: AuthedRequest, res: Response) => {
  try {
    const { id: requestId } = req.params;
    const userId = req.user!.userId;

    const request = await getRequest(requestId);
    const guard = assertParticipant(request, userId);
    if (!guard.ok) {
      return res.status(guard.status).json({ error: guard.error });
    }

    const messages = await prisma.message.findMany({
      where: {
        answerRequestId: requestId,
        OR: [{ visibleToUserId: null }, { visibleToUserId: userId }],
      },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({
      message: 'Successful',
      data: messages.map(formatMessagePayload),
    });
  } catch (error) {
    console.error('getMessages error:', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

/**
 * POST /requests/:id/messages
 * Allowed only when the request is ACCEPTED. Blocked for PENDING/REJECTED/CLOSED_ANSWERED.
 */
export const sendMessage = async (req: AuthedRequest, res: Response) => {
  try {
    const { id: requestId } = req.params;
    const userId = req.user!.userId;
    const { text } = req.body;

    const request = await getRequest(requestId);
    const guard = assertParticipant(request, userId);
    if (!guard.ok) {
      return res.status(guard.status).json({ error: guard.error });
    }

    if (request!.status !== AnswerRequestStatus.ACCEPTED) {
      return res.status(409).json({
        error: `Conversation is locked while request is ${request!.status}`,
      });
    }

    const message = await prisma.message.create({
      data: {
        questionId: request!.questionId,
        answerRequestId: requestId,
        senderId: userId,
        text: text.trim(),
      },
    });

    const payload = formatMessagePayload(message);
    const recipientId = counterpartyIdOf(request!, userId);
    emitToUser(recipientId, 'message:new', payload);

    return res.status(201).json({ message: 'Message sent', data: payload });
  } catch (error) {
    console.error('sendMessage error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

/**
 * POST /requests/:id/messages/read
 * Marks the caller's unread, non-system, non-self messages as read.
 */
export const markMessagesRead = async (req: AuthedRequest, res: Response) => {
  try {
    const { id: requestId } = req.params;
    const userId = req.user!.userId;

    const request = await getRequest(requestId);
    const guard = assertParticipant(request, userId);
    if (!guard.ok) {
      return res.status(guard.status).json({ error: guard.error });
    }

    await prisma.message.updateMany({
      where: {
        answerRequestId: requestId,
        senderId: { not: userId },
        readAt: null,
        OR: [{ visibleToUserId: null }, { visibleToUserId: userId }],
      },
      data: { readAt: new Date() },
    });

    return res.status(200).json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('markMessagesRead error:', error);
    return res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

/**
 * GET /requests/:id/thread
 * Chat context: question summary + counterparty + status + canType flag.
 */
export const getRequestThread = async (req: AuthedRequest, res: Response) => {
  try {
    const { id: requestId } = req.params;
    const userId = req.user!.userId;

    const request = await getRequest(requestId);
    const guard = assertParticipant(request, userId);
    if (!guard.ok) {
      return res.status(guard.status).json({ error: guard.error });
    }

    const counterpartyId = counterpartyIdOf(request!, userId);
    const counterparty = await prisma.user.findUnique({
      where: { id: counterpartyId },
      select: {
        id: true,
        name: true,
        username: true,
        profileImageUrl: true,
      },
    });

    const q = request!.question;
    return res.status(200).json({
      message: 'Successful',
      data: {
        id: request!.id,
        status: request!.status,
        canType: request!.status === AnswerRequestStatus.ACCEPTED,
        questionerId: request!.questionerId,
        responderId: request!.responderId,
        question: {
          id: q.id,
          title: q.title,
          detail: q.detail,
          status: q.status,
          latitude: q.latitude,
          longitude: q.longitude,
          address: q.address,
          category: q.category,
        },
        counterparty,
      },
    });
  } catch (error) {
    console.error('getRequestThread error:', error);
    return res.status(500).json({ error: 'Failed to fetch request thread' });
  }
};

// Re-export MessageType to satisfy type-only imports in callers.
export type { MessageType };
