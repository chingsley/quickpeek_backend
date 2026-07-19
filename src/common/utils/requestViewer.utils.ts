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

export type FeedSectionKey =
  | 'awaiting_your_approval'
  | 'near_you'
  | 'new'
  | 'pending'
  | 'approved'
  | 'answered_by_you'
  | 'rejected';

export const assignFeedSection = (params: {
  viewerRequest: ViewerRequestSummary | null;
  isBlocked: boolean;
  nearMe: boolean;
}): FeedSectionKey => {
  const { viewerRequest, isBlocked, nearMe } = params;

  if (viewerRequest?.status === AnswerRequestStatus.PENDING) {
    return 'pending';
  }
  if (viewerRequest?.status === AnswerRequestStatus.ACCEPTED) {
    return viewerRequest.hasResponded ? 'answered_by_you' : 'approved';
  }
  if (isBlocked || viewerRequest?.status === AnswerRequestStatus.REJECTED) {
    return 'rejected';
  }
  if (nearMe) {
    return 'near_you';
  }
  return 'new';
};

export const FEED_SECTION_ORDER: FeedSectionKey[] = [
  'awaiting_your_approval',
  'near_you',
  'new',
  'pending',
  'approved',
  'answered_by_you',
  'rejected',
];

export const FEED_SECTION_TITLES: Record<FeedSectionKey, string> = {
  awaiting_your_approval: 'Awaiting your approval',
  near_you: 'Near you',
  new: 'New questions',
  pending: 'Waiting for reply',
  approved: 'Approved to answer',
  answered_by_you: 'Answered by you',
  rejected: 'Rejected',
};

/** Pending incoming requests on the viewer's own OPEN questions (questioner feed section). */
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

export const loadViewerRequestMap = async (viewerId: string, questionIds: string[]) => {
  if (questionIds.length === 0) {
    return {
      requestMap: new Map<string, ViewerRequestSummary>(),
      blockMap: new Map<string, { rejectionReason: string | null }>(),
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
