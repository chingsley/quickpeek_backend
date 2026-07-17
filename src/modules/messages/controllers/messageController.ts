import { MessageType, QuestionStatus } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import { emitToUser } from '../../../core/socket/socket.server';
import { cancelTtrOnFirstResponderMessage } from '../../../common/utils/ttr.utils';
import { sendNotification } from '../../../core/messaging/firebase.push';

const formatMessage = (message: {
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

const getRecipientId = (
  question: { userId: string; assignedResponderId: string | null },
  senderId: string,
): string | null => {
  if (senderId === question.userId) {
    return question.assignedResponderId;
  }
  if (senderId === question.assignedResponderId) {
    return question.userId;
  }
  return null;
};

const assertParticipant = async (questionId: string, userId: string) => {
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) {
    return { error: { status: 404, message: 'Question not found' } };
  }

  const isParticipant =
    question.userId === userId || question.assignedResponderId === userId;

  if (!isParticipant) {
    return { error: { status: 403, message: 'Not a participant in this conversation' } };
  }

  return { question };
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;
    const { text } = req.body;

    const result = await assertParticipant(questionId, userId);
    if (result.error) {
      return res.status(result.error.status).json({ error: result.error.message });
    }

    const question = result.question!;

    if (question.status === QuestionStatus.EXPIRED) {
      return res.status(409).json({ error: 'This conversation has expired' });
    }

    const recipientId = getRecipientId(question, userId);

    if (!recipientId) {
      return res.status(409).json({ error: 'No assigned responder for this question' });
    }

    const message = await prisma.message.create({
      data: {
        questionId,
        senderId: userId,
        text: text.trim(),
      },
    });

    await cancelTtrOnFirstResponderMessage(
      questionId,
      userId,
      question.assignedResponderId,
    );

    const payload = formatMessage(message);
    emitToUser(recipientId, 'message:new', payload);

    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { deviceToken: true, notificationsEnabled: true },
    });

    if (recipient?.notificationsEnabled && recipient.deviceToken) {
      await sendNotification(recipient.deviceToken, {
        body: text.trim().slice(0, 120),
        data: { questionId, type: 'message:new' },
      }).catch((err) => console.error('Message push failed:', err));
    }

    return res.status(201).json({ message: 'Message sent', data: payload });
  } catch (error) {
    console.error('sendMessage error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;

    const result = await assertParticipant(questionId, userId);
    if (result.error) {
      return res.status(result.error.status).json({ error: result.error.message });
    }

    const messages = await prisma.message.findMany({
      where: { questionId },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({
      message: 'Successful',
      data: messages.map(formatMessage),
    });
  } catch (error) {
    console.error('getMessages error:', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

export const markMessagesRead = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;

    const result = await assertParticipant(questionId, userId);
    if (result.error) {
      return res.status(result.error.status).json({ error: result.error.message });
    }

    const now = new Date();
    await prisma.message.updateMany({
      where: {
        questionId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: now },
    });

    return res.status(200).json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('markMessagesRead error:', error);
    return res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

export const getQuestionThread = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            profileImageUrl: true,
          },
        },
        assignedResponder: {
          select: {
            id: true,
            name: true,
            username: true,
            profileImageUrl: true,
          },
        },
      },
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const isParticipant =
      question.userId === userId || question.assignedResponderId === userId;

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const counterparty =
      userId === question.userId ? question.assignedResponder : question.user;

    return res.status(200).json({
      message: 'Successful',
      data: {
        id: question.id,
        text: question.text,
        address: question.address,
        latitude: question.latitude,
        longitude: question.longitude,
        status: question.status,
        userId: question.userId,
        assignedResponderId: question.assignedResponderId,
        answeredAt: question.answeredAt?.toISOString() ?? null,
        timeToRespondMs: question.timeToRespondMs,
        respondByAt: question.respondByAt?.toISOString() ?? null,
        createdAt: question.createdAt.toISOString(),
        counterparty: counterparty
          ? {
              id: counterparty.id,
              name: counterparty.name,
              username: counterparty.username,
              profileImageUrl: counterparty.profileImageUrl,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('getQuestionThread error:', error);
    return res.status(500).json({ error: 'Failed to fetch question thread' });
  }
};
