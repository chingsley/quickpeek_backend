import { AnswerRequestStatus, QuestionStatus } from '@prisma/client';
import { Request, Response } from 'express';
import Joi from 'joi';
import prisma from '../../../core/database/prisma/client';
import { emitToUser } from '../../../core/socket/socket.server';
import {
  createAcceptanceBriefingMessages,
  createSystemMessage,
} from '../../../common/utils/messages.utils';
import { calculateHaversineDistance } from '../../../common/utils/geo.utils';
import { getActiveBlock } from '../../../common/utils/requestViewer.utils';

type AuthedRequest = Request & { user?: { userId: string } };

const DEFAULT_LIST_PAGE_SIZE = 20;
const MAX_LIST_PAGE_SIZE = 50;

const parsePagination = (query: Request['query']) => {
  const page = Math.max(parseInt(String(query.page || '1'), 10), 1);
  const limit = Math.min(
    Math.max(parseInt(String(query.limit || String(DEFAULT_LIST_PAGE_SIZE)), 10), 1),
    MAX_LIST_PAGE_SIZE,
  );
  return { page, limit, skip: (page - 1) * limit };
};

export const PRESET_REJECTION_REASONS = [
  'Question already answered',
  'Already got a response',
  'Prefer someone closer to the specified location',
  'I no longer need the information',
  "Doesn't meet the question's requirements",
  'Looking for a verified responder',
] as const;

/**
 * GET /requests/rejection-reasons
 * Returns the preset list of rejection reasons shown in the reject modal.
 */
export const getRejectionReasons = async (_req: AuthedRequest, res: Response) => {
  return res.status(200).json({
    message: 'Successful',
    data: { items: PRESET_REJECTION_REASONS },
  });
};

const requestSummary = (r: any) => ({
  id: r.id,
  questionId: r.questionId,
  responderId: r.responderId,
  questionerId: r.questionerId,
  status: r.status,
  rejectionReason: r.rejectionReason,
  createdAt: r.createdAt.toISOString(),
  respondedAt: r.respondedAt?.toISOString() ?? null,
  question: r.question && {
    id: r.question.id,
    title: r.question.title,
    detail: r.question.detail,
    price: r.question.price,
    status: r.question.status,
    latitude: r.question.latitude,
    longitude: r.question.longitude,
    address: r.question.address,
    answerRadiusKm: r.question.answerRadiusKm,
    category: r.question.category,
  },
  counterparty: r.counterparty,
});

const fetchRequestWithQuestion = (id: string) =>
  prisma.answerRequest.findUnique({
    where: { id },
    include: {
      question: {
        select: {
          id: true,
          title: true,
          detail: true,
          price: true,
          status: true,
          latitude: true,
          longitude: true,
          address: true,
          answerRadiusKm: true,
          acceptanceCriteria: true,
          userId: true,
          category: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

/**
 * POST /questions/:id/requests
 * Responder-only. Guards: own question, already requested, ANSWERED, outside radius.
 * On success: AnswerRequest PENDING + 2 role-specific SYSTEM messages + emit request:new.
 */
export const createRequest = async (req: AuthedRequest, res: Response) => {
  try {
    const { id: questionId } = req.params;
    const responderId = req.user!.userId;

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (question.userId === responderId) {
      return res.status(400).json({ error: 'You cannot request to answer your own question' });
    }

    if (question.status === QuestionStatus.ANSWERED) {
      return res.status(409).json({ error: 'This question has been answered' });
    }
    if (question.status === QuestionStatus.CANCELLED) {
      return res.status(409).json({ error: 'This question has been cancelled' });
    }

    const activeBlock = await getActiveBlock(questionId, responderId);
    if (activeBlock) {
      return res.status(403).json({
        error: 'You are blocked from requesting to answer this question',
        reason: 'BLOCKED',
      });
    }

    const existing = await prisma.answerRequest.findUnique({
      where: { questionId_responderId: { questionId, responderId } },
    });
    if (existing) {
      return res.status(409).json({
        error: 'You have already requested to answer this question',
        existingRequestId: existing.id,
        existingStatus: existing.status,
      });
    }

    if (
      question.answerRadiusKm != null &&
      question.latitude != null &&
      question.longitude != null
    ) {
      const responder = await prisma.user.findUnique({
        where: { id: responderId },
        select: { location: { select: { latitude: true, longitude: true } } },
      });
      if (!responder?.location) {
        return res.status(400).json({
          error: 'Location required to request this question',
          reason: 'NO_VIEWER_LOCATION',
        });
      }
      const distance = calculateHaversineDistance(
        responder.location.latitude,
        responder.location.longitude,
        question.latitude,
        question.longitude,
      );
      if (distance > question.answerRadiusKm) {
        return res.status(403).json({
          error: `You are outside the answer radius (${distance.toFixed(2)}km > ${question.answerRadiusKm}km)`,
          reason: 'OUTSIDE_RADIUS',
          distanceKm: Number(distance.toFixed(2)),
        });
      }
    }

    const responderProfile = await prisma.user.findUnique({
      where: { id: responderId },
      select: { username: true },
    });

    const request = await prisma.answerRequest.create({
      data: {
        questionId,
        responderId,
        questionerId: question.userId,
        status: AnswerRequestStatus.PENDING,
      },
    });

    await Promise.all([
      createSystemMessage({
        questionId,
        answerRequestId: request.id,
        senderId: responderId,
        text: "Your request to answer the question has been sent to the question creator. We'll let you know when they respond.",
        visibleToUserId: responderId,
      }),
      createSystemMessage({
        questionId,
        answerRequestId: request.id,
        senderId: responderId,
        text: `You have a request by @${responderProfile?.username ?? 'someone'} to respond to your question. View their profile before accepting the request.`,
        visibleToUserId: question.userId,
      }),
    ]);

    emitToUser(question.userId, 'request:new', {
      id: request.id,
      questionId,
      responderId,
      createdAt: request.createdAt.toISOString(),
    });

    return res.status(201).json({ message: 'Request sent', data: { id: request.id, status: request.status } });
  } catch (error) {
    console.error('createRequest error:', error);
    return res.status(500).json({ error: 'Failed to create request' });
  }
};

/**
 * POST /requests/:id/accept
 * Questioner-only. PENDING -> ACCEPTED with respondedAt; system msg "Request accepted" (both).
 */
export const acceptRequest = async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const request = await fetchRequestWithQuestion(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.questionerId !== userId) {
      return res.status(403).json({ error: 'Only the questioner can accept requests' });
    }
    if (request.status !== AnswerRequestStatus.PENDING) {
      return res.status(409).json({ error: `Request is already ${request.status}` });
    }

    const now = new Date();
    const updated = await prisma.answerRequest.update({
      where: { id },
      data: { status: AnswerRequestStatus.ACCEPTED, respondedAt: now },
    });

    await createSystemMessage({
      questionId: request.questionId,
      answerRequestId: id,
      senderId: userId,
      text: 'Request accepted.',
      recipientIds: [request.responderId, userId],
    });

    await createAcceptanceBriefingMessages({
      questionId: request.questionId,
      answerRequestId: id,
      questionerId: userId,
      responderId: request.responderId,
      question: {
        address: request.question.address,
        latitude: request.question.latitude,
        longitude: request.question.longitude,
        detail: request.question.detail,
        acceptanceCriteria: request.question.acceptanceCriteria,
      },
    });

    emitToUser(request.responderId, 'request:accepted', {
      id,
      questionId: request.questionId,
      acceptedAt: now.toISOString(),
    });
    emitToUser(userId, 'request:accepted', {
      id,
      questionId: request.questionId,
      acceptedAt: now.toISOString(),
    });

    return res.status(200).json({
      message: 'Request accepted',
      data: { id: updated.id, status: updated.status, respondedAt: updated.respondedAt?.toISOString() ?? null },
    });
  } catch (error) {
    console.error('acceptRequest error:', error);
    return res.status(500).json({ error: 'Failed to accept request' });
  }
};

const rejectSchema = Joi.object({
  rejectionReason: Joi.string().trim().min(2).max(300).required(),
});

/**
 * POST /requests/:id/reject
 * Questioner-only. PENDING -> REJECTED with reason; system msg with reason to responder only.
 */
export const rejectRequest = async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const { error, value } = rejectSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const request = await fetchRequestWithQuestion(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.questionerId !== userId) {
      return res.status(403).json({ error: 'Only the questioner can reject requests' });
    }
    if (request.status !== AnswerRequestStatus.PENDING) {
      return res.status(409).json({ error: `Request is already ${request.status}` });
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const rejected = await tx.answerRequest.update({
        where: { id },
        data: {
          status: AnswerRequestStatus.REJECTED,
          rejectionReason: value.rejectionReason,
          respondedAt: now,
        },
      });

      await tx.questionResponderBlock.create({
        data: {
          questionId: request.questionId,
          responderId: request.responderId,
          answerRequestId: id,
          rejectionReason: value.rejectionReason,
        },
      });

      return rejected;
    });

    await createSystemMessage({
      questionId: request.questionId,
      answerRequestId: id,
      senderId: userId,
      text: `Your request was declined: ${value.rejectionReason}`,
      visibleToUserId: request.responderId,
    });

    emitToUser(request.responderId, 'request:rejected', {
      id,
      questionId: request.questionId,
      rejectionReason: value.rejectionReason,
      rejectedAt: now.toISOString(),
    });

    return res.status(200).json({
      message: 'Request rejected',
      data: {
        id: updated.id,
        status: updated.status,
        rejectionReason: updated.rejectionReason,
        respondedAt: updated.respondedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('rejectRequest error:', error);
    return res.status(500).json({ error: 'Failed to reject request' });
  }
};

/**
 * GET /requests/incoming?questionId=&status=
 * Questioner's incoming requests (optionally filtered by question).
 */
export const getIncomingRequests = async (req: AuthedRequest, res: Response) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const userId = req.user!.userId;
    const questionId = typeof req.query.questionId === 'string' ? req.query.questionId : undefined;
    const status =
      typeof req.query.status === 'string' && Object.values(AnswerRequestStatus).includes(req.query.status as AnswerRequestStatus)
        ? (req.query.status as AnswerRequestStatus)
        : undefined;

    const where: any = { questionerId: userId };
    if (questionId) where.questionId = questionId;
    if (status) where.status = status;

    const [total, rows] = await Promise.all([
      prisma.answerRequest.count({ where }),
      prisma.answerRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          question: {
            select: {
              id: true,
              title: true,
              detail: true,
              price: true,
              status: true,
              category: { select: { id: true, name: true, slug: true } },
            },
          },
          responder: {
            select: { id: true, name: true, username: true, profileImageUrl: true },
          },
        },
      }),
    ]);

    const items = rows.map((r) =>
      requestSummary({
        ...r,
        counterparty: {
          id: r.responder.id,
          name: r.responder.name,
          username: r.responder.username,
          profileImageUrl: r.responder.profileImageUrl,
        },
      }),
    );

    return res.status(200).json({
      message: 'Successful',
      data: { items, pagination: { page, limit, total, hasMore: skip + items.length < total } },
    });
  } catch (error) {
    console.error('getIncomingRequests error:', error);
    return res.status(500).json({ error: 'Failed to fetch incoming requests' });
  }
};

/**
 * GET /requests/outgoing?status=
 * Responder's outgoing requests.
 */
export const getOutgoingRequests = async (req: AuthedRequest, res: Response) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const userId = req.user!.userId;
    const status =
      typeof req.query.status === 'string' && Object.values(AnswerRequestStatus).includes(req.query.status as AnswerRequestStatus)
        ? (req.query.status as AnswerRequestStatus)
        : undefined;

    const where: any = { responderId: userId };
    if (status) where.status = status;

    const [total, rows] = await Promise.all([
      prisma.answerRequest.count({ where }),
      prisma.answerRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          question: {
            select: {
              id: true,
              title: true,
              detail: true,
              price: true,
              status: true,
              latitude: true,
              longitude: true,
              address: true,
              answerRadiusKm: true,
              category: { select: { id: true, name: true, slug: true } },
            },
          },
          questioner: {
            select: { id: true, name: true, username: true, profileImageUrl: true },
          },
        },
      }),
    ]);

    const items = rows.map((r) =>
      requestSummary({
        ...r,
        counterparty: {
          id: r.questioner.id,
          name: r.questioner.name,
          username: r.questioner.username,
          profileImageUrl: r.questioner.profileImageUrl,
        },
      }),
    );

    return res.status(200).json({
      message: 'Successful',
      data: { items, pagination: { page, limit, total, hasMore: skip + items.length < total } },
    });
  } catch (error) {
    console.error('getOutgoingRequests error:', error);
    return res.status(500).json({ error: 'Failed to fetch outgoing requests' });
  }
};

/**
 * GET /requests/conversations
 * Unified inbox: all request-scoped chats (pending + accepted + closed),
 * sorted by latest activity, with unread counts per thread.
 */
export const getConversations = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const rows = await prisma.answerRequest.findMany({
      where: {
        OR: [{ questionerId: userId }, { responderId: userId }],
      },
      include: {
        question: { select: { id: true, title: true, status: true } },
        questioner: {
          select: { id: true, name: true, username: true, profileImageUrl: true },
        },
        responder: {
          select: { id: true, name: true, username: true, profileImageUrl: true },
        },
        messages: {
          where: {
            OR: [{ visibleToUserId: null }, { visibleToUserId: userId }],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            text: true,
            type: true,
            createdAt: true,
            senderId: true,
            readAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const requestIds = rows.map((r) => r.id);
    const unreadGroups =
      requestIds.length > 0
        ? await prisma.message.groupBy({
            by: ['answerRequestId'],
            where: {
              answerRequestId: { in: requestIds },
              senderId: { not: userId },
              readAt: null,
              OR: [{ visibleToUserId: null }, { visibleToUserId: userId }],
            },
            _count: { id: true },
          })
        : [];
    const unreadMap = new Map(unreadGroups.map((g) => [g.answerRequestId, g._count.id]));

    const items = rows.map((r) => {
      const isQuestioner = r.questionerId === userId;
      const counterparty = isQuestioner ? r.responder : r.questioner;
      const lastMessage = r.messages[0] ?? null;
      const unreadCount = unreadMap.get(r.id) ?? 0;
      const sortAt = lastMessage?.createdAt ?? r.respondedAt ?? r.createdAt;

      return {
        requestId: r.id,
        questionId: r.questionId,
        status: r.status,
        role: isQuestioner ? 'incoming' : 'outgoing',
        question: r.question,
        counterparty: {
          id: counterparty.id,
          name: counterparty.name,
          username: counterparty.username,
          profileImageUrl: counterparty.profileImageUrl,
        },
        lastMessage: lastMessage
          ? {
              text: lastMessage.text,
              type: lastMessage.type,
              createdAt: lastMessage.createdAt.toISOString(),
            }
          : null,
        unreadCount,
        hasUnread: unreadCount > 0,
        sortAt: sortAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      };
    });

    items.sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());

    const unreadTotal = items.reduce((sum, item) => sum + item.unreadCount, 0);

    return res.status(200).json({
      message: 'Successful',
      data: { items, unreadTotal },
    });
  } catch (error) {
    console.error('getConversations error:', error);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

/**
 * GET /requests/:id
 * Returns the request context: question summary, counterparty, status, canType.
 */
export const getRequestDetail = async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const request = await fetchRequestWithQuestion(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.responderId !== userId && request.questionerId !== userId) {
      return res.status(403).json({ error: 'Not a participant in this request' });
    }

    const counterpartyId = userId === request.questionerId ? request.responderId : request.questionerId;
    const counterparty = await prisma.user.findUnique({
      where: { id: counterpartyId },
      select: { id: true, name: true, username: true, profileImageUrl: true },
    });

    return res.status(200).json({
      message: 'Successful',
      data: {
        id: request.id,
        questionId: request.questionId,
        responderId: request.responderId,
        questionerId: request.questionerId,
        status: request.status,
        rejectionReason: request.rejectionReason,
        createdAt: request.createdAt.toISOString(),
        respondedAt: request.respondedAt?.toISOString() ?? null,
        canType: request.status === AnswerRequestStatus.ACCEPTED,
        question: {
          id: request.question.id,
          title: request.question.title,
          detail: request.question.detail,
          price: request.question.price,
          status: request.question.status,
          latitude: request.question.latitude,
          longitude: request.question.longitude,
          address: request.question.address,
          answerRadiusKm: request.question.answerRadiusKm,
          category: request.question.category,
        },
        counterparty,
      },
    });
  } catch (error) {
    console.error('getRequestDetail error:', error);
    return res.status(500).json({ error: 'Failed to fetch request detail' });
  }
};
