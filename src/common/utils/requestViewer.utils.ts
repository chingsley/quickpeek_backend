import { AnswerRequestStatus, MessageType, QuestionStatus } from '@prisma/client';
import prisma from '../../core/database/prisma/client';

export type ViewerRequestSummary = {
  id: string;
  status: AnswerRequestStatus;
  rejectionReason: string | null;
  hasResponded: boolean;
  unreadCount: number;
  isBlocked: boolean;
};

export const getActiveBlock = (questionId: string, responderId: string) =>
  prisma.questionResponderBlock.findFirst({
    where: { questionId, responderId, removedAt: null },
  });

export const hasResponderSentUserMessage = async (
  answerRequestId: string,
  responderId: string,
): Promise<boolean> => {
  const count = await prisma.message.count({
    where: {
      answerRequestId,
      senderId: responderId,
      type: MessageType.USER,
    },
  });
  return count > 0;
};

export const getUnreadCountForRequest = async (
  answerRequestId: string,
  userId: string,
): Promise<number> =>
  prisma.message.count({
    where: {
      answerRequestId,
      senderId: { not: userId },
      readAt: null,
      OR: [{ visibleToUserId: null }, { visibleToUserId: userId }],
    },
  });

export const buildViewerRequestSummary = async (
  request: {
    id: string;
    status: AnswerRequestStatus;
    rejectionReason: string | null;
    responderId: string;
  },
  viewerId: string,
  isBlocked: boolean,
): Promise<ViewerRequestSummary> => {
  const hasResponded =
    request.status === AnswerRequestStatus.ACCEPTED
      ? await hasResponderSentUserMessage(request.id, request.responderId)
      : false;
  const unreadCount = await getUnreadCountForRequest(request.id, viewerId);

  return {
    id: request.id,
    status: request.status,
    rejectionReason: request.rejectionReason,
    hasResponded,
    unreadCount,
    isBlocked,
  };
};

export type IncomingRequestSummary = {
  id: string;
  status: AnswerRequestStatus;
  unreadCount: number;
  responder: {
    id: string;
    name: string;
    username: string;
    profileImageUrl: string | null;
  };
};

/** Pending incoming requests on the viewer's own OPEN questions. */
export const loadAwaitingApprovalFeedItems = async (viewerId: string) => {
  const requests = await prisma.answerRequest.findMany({
    where: {
      questionerId: viewerId,
      status: AnswerRequestStatus.PENDING,
      question: { status: QuestionStatus.OPEN },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      question: {
        include: {
          category: { select: { id: true, name: true, slug: true } },
          user: {
            select: { id: true, name: true, username: true, profileImageUrl: true },
          },
        },
      },
      responder: {
        select: { id: true, name: true, username: true, profileImageUrl: true },
      },
    },
  });

  const requestIds = requests.map((r) => r.id);
  const unreadGroups =
    requestIds.length > 0
      ? await prisma.message.groupBy({
        by: ['answerRequestId'],
        where: {
          answerRequestId: { in: requestIds },
          senderId: { not: viewerId },
          readAt: null,
          OR: [{ visibleToUserId: null }, { visibleToUserId: viewerId }],
        },
        _count: { id: true },
      })
      : [];
  const unreadMap = new Map(unreadGroups.map((g) => [g.answerRequestId, g._count.id]));

  return requests.map((r) => ({
    request: r,
    unreadCount: unreadMap.get(r.id) ?? 0,
  }));
};

/** One feed row per question with pending incoming requests (grouped). */
export const buildAwaitingApprovalFeedQuestions = async (viewerId: string) => {
  const items = await loadAwaitingApprovalFeedItems(viewerId);
  const byQuestion = new Map<string, typeof items>();

  for (const entry of items) {
    const questionId = entry.request.questionId;
    const group = byQuestion.get(questionId) ?? [];
    group.push(entry);
    byQuestion.set(questionId, group);
  }

  return [...byQuestion.values()]
    .map((entries) => {
      const latest = entries[0].request;
      return {
        question: latest.question,
        incomingRequest: {
          id: latest.id,
          status: latest.status,
          unreadCount: entries.reduce((sum, e) => sum + e.unreadCount, 0),
          responder: latest.responder,
        },
        sortAt: latest.createdAt,
      };
    })
    .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
    .map(({ question, incomingRequest }) => ({
      question,
      incomingRequest,
    }));
};

export const loadViewerRequestMap = async (viewerId: string, questionIds: string[]) => {
  if (questionIds.length === 0) {
    return {
      requestMap: new Map<string, ViewerRequestSummary>(),
      blockMap: new Map<string, { rejectionReason: string | null; }>(),
    };
  }

  const [requests, blocks] = await Promise.all([
    prisma.answerRequest.findMany({
      where: { responderId: viewerId, questionId: { in: questionIds } },
      select: {
        id: true,
        questionId: true,
        status: true,
        rejectionReason: true,
        responderId: true,
      },
    }),
    prisma.questionResponderBlock.findMany({
      where: { responderId: viewerId, questionId: { in: questionIds }, removedAt: null },
      select: { questionId: true, rejectionReason: true },
    }),
  ]);

  const acceptedIds = requests
    .filter((r) => r.status === AnswerRequestStatus.ACCEPTED)
    .map((r) => r.id);

  const respondedSet = new Set<string>();
  if (acceptedIds.length > 0) {
    const responded = await prisma.message.groupBy({
      by: ['answerRequestId'],
      where: {
        answerRequestId: { in: acceptedIds },
        type: MessageType.USER,
        senderId: viewerId,
      },
      _count: { id: true },
    });
    responded.forEach((g) => respondedSet.add(g.answerRequestId));
  }

  const requestIds = requests.map((r) => r.id);
  const unreadGroups =
    requestIds.length > 0
      ? await prisma.message.groupBy({
        by: ['answerRequestId'],
        where: {
          answerRequestId: { in: requestIds },
          senderId: { not: viewerId },
          readAt: null,
          OR: [{ visibleToUserId: null }, { visibleToUserId: viewerId }],
        },
        _count: { id: true },
      })
      : [];
  const unreadMap = new Map(unreadGroups.map((g) => [g.answerRequestId, g._count.id]));

  const blockMap = new Map(
    blocks.map((b) => [b.questionId, { rejectionReason: b.rejectionReason }]),
  );

  const requestMap = new Map<string, ViewerRequestSummary>();
  for (const r of requests) {
    const isBlocked = blockMap.has(r.questionId);
    requestMap.set(r.questionId, {
      id: r.id,
      status: r.status,
      rejectionReason: r.rejectionReason ?? blockMap.get(r.questionId)?.rejectionReason ?? null,
      hasResponded: respondedSet.has(r.id),
      unreadCount: unreadMap.get(r.id) ?? 0,
      isBlocked,
    });
  }

  for (const [questionId, block] of blockMap) {
    if (!requestMap.has(questionId)) {
      requestMap.set(questionId, {
        id: '',
        status: AnswerRequestStatus.REJECTED,
        rejectionReason: block.rejectionReason,
        hasResponded: false,
        unreadCount: 0,
        isBlocked: true,
      });
    }
  }

  return { requestMap, blockMap };
};

export type QuestionFeedAttention = {
  hasAttention: boolean;
  unreadMessageCount: number;
  /** Earliest unread message timestamp for FIFO feed ordering. */
  earliestUnreadAt: string | null;
  pendingIncomingCount: number;
  acceptedChatCount: number;
  primaryChatRequestId: string | null;
};

const EMPTY_QUESTION_FEED_ATTENTION: QuestionFeedAttention = {
  hasAttention: false,
  unreadMessageCount: 0,
  earliestUnreadAt: null,
  pendingIncomingCount: 0,
  acceptedChatCount: 0,
  primaryChatRequestId: null,
};

const loadEarliestUnreadAtByQuestion = async (
  viewerId: string,
  questionIds: string[],
): Promise<Map<string, Date>> => {
  if (questionIds.length === 0) {
    return new Map();
  }

  const messages = await prisma.message.findMany({
    where: {
      questionId: { in: questionIds },
      senderId: { not: viewerId },
      readAt: null,
      OR: [{ visibleToUserId: null }, { visibleToUserId: viewerId }],
    },
    select: {
      questionId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const earliestByQuestion = new Map<string, Date>();
  for (const message of messages) {
    if (!earliestByQuestion.has(message.questionId)) {
      earliestByQuestion.set(message.questionId, message.createdAt);
    }
  }

  return earliestByQuestion;
};

/** Per-question attention state for the Home feed (unread chats + pending approvals). */
export const loadQuestionFeedAttentionMap = async (
  viewerId: string,
  questions: Array<{ id: string; userId: string }>,
): Promise<Map<string, QuestionFeedAttention>> => {
  const result = new Map<string, QuestionFeedAttention>();
  if (questions.length === 0) {
    return result;
  }

  const questionIds = questions.map((q) => q.id);
  const ownerByQuestion = new Map(questions.map((q) => [q.id, q.userId]));

  const allRequests = await prisma.answerRequest.findMany({
    where: { questionId: { in: questionIds } },
    select: {
      id: true,
      questionId: true,
      questionerId: true,
      responderId: true,
      status: true,
    },
  });

  const requestIds = allRequests.map((r) => r.id);
  const [unreadMap, earliestUnreadByQuestion] = await Promise.all([
    (async () => {
      const map = new Map<string, number>();
      if (requestIds.length === 0) {
        return map;
      }

      const unreadGroups = await prisma.message.groupBy({
        by: ['answerRequestId'],
        where: {
          answerRequestId: { in: requestIds },
          senderId: { not: viewerId },
          readAt: null,
          OR: [{ visibleToUserId: null }, { visibleToUserId: viewerId }],
        },
        _count: { id: true },
      });
      unreadGroups.forEach((g) => map.set(g.answerRequestId, g._count.id));
      return map;
    })(),
    loadEarliestUnreadAtByQuestion(viewerId, questionIds),
  ]);

  for (const questionId of questionIds) {
    const isOwner = ownerByQuestion.get(questionId) === viewerId;
    const reqs = allRequests.filter((r) => r.questionId === questionId);

    if (isOwner) {
      const ownerReqs = reqs.filter((r) => r.questionerId === viewerId);
      const pendingIncomingCount = ownerReqs.filter(
        (r) => r.status === AnswerRequestStatus.PENDING,
      ).length;
      const accepted = ownerReqs.filter((r) => r.status === AnswerRequestStatus.ACCEPTED);
      const unreadMessageCount = ownerReqs.reduce(
        (sum, r) => sum + (unreadMap.get(r.id) ?? 0),
        0,
      );

      const earliestUnreadAt = earliestUnreadByQuestion.get(questionId);

      result.set(questionId, {
        pendingIncomingCount,
        acceptedChatCount: accepted.length,
        unreadMessageCount,
        earliestUnreadAt: earliestUnreadAt?.toISOString() ?? null,
        primaryChatRequestId: accepted.length === 1 ? accepted[0].id : null,
        hasAttention: unreadMessageCount > 0 || pendingIncomingCount > 0,
      });
    } else {
      const viewerReq = reqs.find((r) => r.responderId === viewerId);
      const unreadMessageCount = viewerReq ? (unreadMap.get(viewerReq.id) ?? 0) : 0;
      const earliestUnreadAt = earliestUnreadByQuestion.get(questionId);

      result.set(questionId, {
        pendingIncomingCount: 0,
        acceptedChatCount:
          viewerReq?.status === AnswerRequestStatus.ACCEPTED ? 1 : 0,
        unreadMessageCount,
        earliestUnreadAt: earliestUnreadAt?.toISOString() ?? null,
        primaryChatRequestId: viewerReq?.id ?? null,
        hasAttention: unreadMessageCount > 0,
      });
    }
  }

  return result;
};

export const getQuestionFeedAttention = (
  map: Map<string, QuestionFeedAttention>,
  questionId: string,
): QuestionFeedAttention => map.get(questionId) ?? EMPTY_QUESTION_FEED_ATTENTION;
