import { AnswerRequestStatus, Prisma, QuestionStatus } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import { emitToUser } from '../../../core/socket/socket.server';
import { calculateHaversineDistance } from '../../../common/utils/geo.utils';
import { createSystemMessage } from '../../../common/utils/messages.utils';
import {
  getUserRatingByRole,
  invalidateUserRatingCache,
} from '../../../common/utils/ratings';
import { RatingRole } from '@prisma/client';
import {
  getCachedNearbyQuestions,
  invalidateNearbyQuestionsCache,
  nearbyCacheKey,
  setCachedNearbyQuestions,
} from '../../../common/utils/cache';
import {
  assignFeedSection,
  buildViewerRequestSummary,
  FEED_SECTION_ORDER,
  FEED_SECTION_TITLES,
  FeedSectionKey,
  getActiveBlock,
  loadViewerRequestMap,
  loadAwaitingApprovalFeedItems,
  ViewerRequestSummary,
} from '../../../common/utils/requestViewer.utils';

type AuthedRequest = Request & { user?: { userId: string } };

const DEFAULT_FEED_PAGE_SIZE = 20;
const MAX_FEED_PAGE_SIZE = 50;

const parsePagination = (query: Request['query']) => {
  const page = Math.max(parseInt(String(query.page || '1'), 10), 1);
  const limit = Math.min(
    Math.max(parseInt(String(query.limit || String(DEFAULT_FEED_PAGE_SIZE)), 10), 1),
    MAX_FEED_PAGE_SIZE,
  );
  return { page, limit, skip: (page - 1) * limit };
};

const publicQuestionShape = (q: any) => ({
  id: q.id,
  title: q.title,
  detail: q.detail,
  price: q.price,
  acceptanceCriteria: q.acceptanceCriteria,
  latitude: q.latitude,
  longitude: q.longitude,
  address: q.address,
  answerRadiusKm: q.answerRadiusKm,
  status: q.status,
  createdAt: q.createdAt.toISOString(),
  answeredAt: q.answeredAt?.toISOString() ?? null,
  category: q.category,
  questioner: q.user && {
    id: q.user.id,
    name: q.user.name,
    username: q.user.username,
    profileImageUrl: q.user.profileImageUrl,
  },
});

/**
 * POST /questions — create a marketplace question.
 * Body validated by validateQuestionCreation.
 */
export const createQuestion = async (req: AuthedRequest, res: Response) => {
  try {
    const {
      title,
      detail,
      categoryId,
      price,
      acceptanceCriteria,
      latitude,
      longitude,
      address,
      answerRadiusKm,
    } = req.body;

    const question = await prisma.question.create({
      data: {
        title,
        detail,
        categoryId,
        price,
        acceptanceCriteria,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        address: address ?? null,
        answerRadiusKm: answerRadiusKm ?? null,
        userId: req.user!.userId,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    await invalidateNearbyQuestionsCache().catch((err) =>
      console.error('createQuestion cache invalidation failed', err),
    );

    return res.status(201).json({
      message: 'Question created successfully',
      data: { ...publicQuestionShape(question), userId: question.userId },
    });
  } catch (error) {
    console.error('createQuestion error:', error);
    return res.status(500).json({ error: 'Failed to create question' });
  }
};

/**
 * GET /questions/feed — public feed of OPEN questions.
 * Authenticated viewers receive sectioned feed with interaction state.
 * Filters:
 *   ?categoryId=         restrict to category
 *   ?lat=&lng=           viewer coords (enables distance + nearMe flag)
 *   ?radiusKm=           restrict to within radius of viewer
 *   ?page=&limit=        pagination (flat feed only)
 */
export const getQuestionFeed = async (req: AuthedRequest, res: Response) => {
  try {
    const viewerId = req.user?.userId;
    const { page, limit, skip } = parsePagination(req.query);
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;
    const lat = req.query.lat != null ? parseFloat(String(req.query.lat)) : NaN;
    const lng = req.query.lng != null ? parseFloat(String(req.query.lng)) : NaN;
    const radiusKm = req.query.radiusKm != null ? parseFloat(String(req.query.radiusKm)) : NaN;
    const clientPassedCoords = !Number.isNaN(lat) && !Number.isNaN(lng);
    let effectiveLat = lat;
    let effectiveLng = lng;
    let viewerHasCoords = clientPassedCoords;

    if (viewerId && !viewerHasCoords) {
      const userLocation = await prisma.location.findUnique({
        where: { userId: viewerId },
        select: { latitude: true, longitude: true },
      });
      if (userLocation) {
        effectiveLat = userLocation.latitude;
        effectiveLng = userLocation.longitude;
        viewerHasCoords = true;
      }
    }

    const useRadiusFilter =
      clientPassedCoords && !Number.isNaN(radiusKm) && radiusKm > 0;

    if (!viewerId && !categoryId && !viewerHasCoords && page === 1) {
      const key = `feed:open:p1:limit${limit}`;
      const cached = await getCachedNearbyQuestions<any>(key);
      if (cached) {
        return res.status(200).json({ message: 'Successful (cached)', data: cached });
      }
    }

    const where: Prisma.QuestionWhereInput = {
      status: QuestionStatus.OPEN,
      ...(categoryId ? { categoryId } : {}),
      ...(viewerId ? { userId: { not: viewerId } } : {}),
    };

    const rows = await prisma.question.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        user: {
          select: { id: true, name: true, username: true, profileImageUrl: true },
        },
      },
    });

    const questionIds = rows.map((q) => q.id);
    const { requestMap } = viewerId
      ? await loadViewerRequestMap(viewerId, questionIds)
      : { requestMap: new Map<string, ViewerRequestSummary>() };

    const enriched = rows.map((q) => {
      const item: any = publicQuestionShape(q);
      let nearMe = false;
      if (viewerHasCoords && q.latitude != null && q.longitude != null) {
        const distanceKm = calculateHaversineDistance(
          effectiveLat,
          effectiveLng,
          q.latitude,
          q.longitude,
        );
        item.distanceKm = Number(distanceKm.toFixed(2));
        if (useRadiusFilter) {
          nearMe = distanceKm <= radiusKm;
        } else if (q.answerRadiusKm != null) {
          nearMe = distanceKm <= q.answerRadiusKm;
        }
      } else {
        item.distanceKm = null;
      }
      item.nearMe = nearMe;

      const viewerRequest = requestMap.get(q.id) ?? null;
      if (viewerRequest) {
        item.viewerRequest = viewerRequest;
        item.sectionKey = assignFeedSection({
          viewerRequest,
          isBlocked: viewerRequest.isBlocked,
          nearMe,
        });
      } else if (viewerId) {
        item.sectionKey = assignFeedSection({
          viewerRequest: null,
          isBlocked: false,
          nearMe,
        });
      }

      return item;
    });

    const visible = useRadiusFilter
      ? enriched.filter((q: any) => {
          if (q.viewerRequest) return true;
          return q.distanceKm != null && q.distanceKm <= radiusKm;
        })
      : enriched;

    if (viewerId) {
      const buckets = new Map<FeedSectionKey, any[]>(
        FEED_SECTION_ORDER.map((key) => [key, []]),
      );
      for (const item of visible) {
        const key = (item.sectionKey as FeedSectionKey) ?? 'new';
        buckets.get(key)?.push(item);
      }

      const awaitingApproval = await loadAwaitingApprovalFeedItems(viewerId);
      for (const { request, unreadCount } of awaitingApproval) {
        const q = request.question;
        buckets.get('awaiting_your_approval')?.push({
          ...publicQuestionShape(q),
          userId: q.userId,
          incomingRequest: {
            id: request.id,
            status: request.status,
            unreadCount,
            responder: request.responder,
          },
          sectionKey: 'awaiting_your_approval',
        });
      }

      const sections = FEED_SECTION_ORDER.map((key) => ({
        key,
        title: FEED_SECTION_TITLES[key],
        items: buckets.get(key) ?? [],
      })).filter((section) => section.items.length > 0);

      return res.status(200).json({
        message: 'Successful',
        data: { sections },
      });
    }

    const paginated = visible.slice(skip, skip + limit);
    const response = {
      items: paginated,
      pagination: {
        page,
        limit,
        total: visible.length,
        hasMore: skip + paginated.length < visible.length,
      },
    };

    if (!categoryId && !viewerHasCoords && page === 1) {
      const key = `feed:open:p1:limit${limit}`;
      await setCachedNearbyQuestions(key, response).catch(() => {});
    }

    return res.status(200).json({ message: 'Successful', data: response });
  } catch (error) {
    console.error('getQuestionFeed error:', error);
    return res.status(500).json({ error: 'Failed to fetch question feed' });
  }
};

/**
 * GET /questions/mine — questioner's own questions with per-status request counts.
 */
export const getUserPostedQuestions = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const questions = await prisma.question.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        requests: {
          select: {
            id: true,
            status: true,
            responder: {
              select: { id: true, name: true, username: true, profileImageUrl: true },
            },
            createdAt: true,
            respondedAt: true,
          },
        },
      },
    });

    const data = questions.map((q) => {
      const requestCounts = q.requests.reduce(
        (acc, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<AnswerRequestStatus, number>,
      );
      return {
        ...publicQuestionShape(q),
        userId: q.userId,
        requests: q.requests,
        requestCounts,
      };
    });

    return res.status(200).json({ message: 'Successful', data });
  } catch (error) {
    console.error('getUserPostedQuestions error:', error);
    return res.status(500).json({ error: 'Failed to fetch questions' });
  }
};

type CanRequestReason =
  | 'OUTSIDE_RADIUS'
  | 'ALREADY_REQUESTED'
  | 'BLOCKED'
  | 'ANSWERED'
  | 'CANCELLED'
  | 'OWN_QUESTION'
  | 'NO_VIEWER_LOCATION';

const computeCanRequest = async (
  question: {
    id: string;
    userId: string;
    status: QuestionStatus;
    latitude: number | null;
    longitude: number | null;
    answerRadiusKm: number | null;
  },
  viewer: { userId: string; latitude?: number | null; longitude?: number | null } | null,
): Promise<{ canRequest: boolean; reason: CanRequestReason | null; existingRequestId: string | null }> => {
  if (question.userId === viewer?.userId) {
    return { canRequest: false, reason: 'OWN_QUESTION', existingRequestId: null };
  }
  if (question.status === QuestionStatus.ANSWERED) {
    return { canRequest: false, reason: 'ANSWERED', existingRequestId: null };
  }
  if (question.status === QuestionStatus.CANCELLED) {
    return { canRequest: false, reason: 'CANCELLED', existingRequestId: null };
  }

  let existingRequestId: string | null = null;
  if (viewer) {
    const activeBlock = await getActiveBlock(question.id, viewer.userId);
    if (activeBlock) {
      return {
        canRequest: false,
        reason: 'BLOCKED',
        existingRequestId: activeBlock.answerRequestId,
      };
    }

    const existing = await prisma.answerRequest.findUnique({
      where: {
        questionId_responderId: { questionId: question.id, responderId: viewer.userId },
      },
      select: { id: true },
    });
    if (existing) {
      existingRequestId = existing.id;
      return { canRequest: false, reason: 'ALREADY_REQUESTED', existingRequestId };
    }
  }

  // Radius check only if the question has a location + radius.
  if (
    question.answerRadiusKm != null &&
    question.latitude != null &&
    question.longitude != null
  ) {
    if (!viewer || viewer.latitude == null || viewer.longitude == null) {
      return { canRequest: false, reason: 'NO_VIEWER_LOCATION', existingRequestId };
    }
    const distance = calculateHaversineDistance(
      viewer.latitude,
      viewer.longitude,
      question.latitude,
      question.longitude,
    );
    if (distance > question.answerRadiusKm) {
      return { canRequest: false, reason: 'OUTSIDE_RADIUS', existingRequestId };
    }
  }

  return { canRequest: true, reason: null, existingRequestId };
};

/**
 * GET /questions/:id — public question detail.
 * Authenticated viewers get a `canRequest` verdict + their existing request status.
 * Questioner's public rating summary is included for responder due-diligence.
 */
export const getQuestionDetail = async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const viewerId = req.user?.userId;

    const question = await prisma.question.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            profileImageUrl: true,
            location: { select: { latitude: true, longitude: true } },
          },
        },
      },
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const viewer =
      viewerId != null
        ? await prisma.user.findUnique({
            where: { id: viewerId },
            select: {
              id: true,
              location: { select: { latitude: true, longitude: true } },
            },
          })
        : null;

    const viewerWithCoords = viewer
      ? {
          userId: viewer.id,
          latitude: viewer.location?.latitude ?? null,
          longitude: viewer.location?.longitude ?? null,
        }
      : null;

    const canRequestInfo = await computeCanRequest(question, viewerWithCoords);

    let viewerRequest: ViewerRequestSummary | null = null;
    if (viewerId) {
      const existing = await prisma.answerRequest.findUnique({
        where: {
          questionId_responderId: { questionId: id, responderId: viewerId },
        },
        select: {
          id: true,
          status: true,
          rejectionReason: true,
          responderId: true,
        },
      });
      const activeBlock = await getActiveBlock(id, viewerId);
      if (existing) {
        viewerRequest = await buildViewerRequestSummary(
          existing,
          viewerId,
          !!activeBlock,
        );
      } else if (activeBlock) {
        viewerRequest = {
          id: '',
          status: AnswerRequestStatus.REJECTED,
          rejectionReason: activeBlock.rejectionReason,
          hasResponded: false,
          unreadCount: 0,
          isBlocked: true,
        };
      }
    }

    const [asResponder, asQuestioner] = await Promise.all([
      getUserRatingByRole(question.userId, RatingRole.AS_RESPONDER),
      getUserRatingByRole(question.userId, RatingRole.AS_QUESTIONER),
    ]);

    let distanceKm: number | null = null;
    if (
      viewerWithCoords &&
      viewerWithCoords.latitude != null &&
      viewerWithCoords.longitude != null &&
      question.latitude != null &&
      question.longitude != null
    ) {
      distanceKm = Number(
        calculateHaversineDistance(
          viewerWithCoords.latitude,
          viewerWithCoords.longitude,
          question.latitude,
          question.longitude,
        ).toFixed(2),
      );
    }

    return res.status(200).json({
      message: 'Successful',
      data: {
        ...publicQuestionShape(question),
        userId: question.userId,
        distanceKm,
        questioner: {
          id: question.user.id,
          name: question.user.name,
          username: question.user.username,
          profileImageUrl: question.user.profileImageUrl,
          asResponder: {
            averageRating: asResponder.averageRating,
            reviewsCount: asResponder.reviewsCount,
          },
          asQuestioner: {
            averageRating: asQuestioner.averageRating,
            reviewsCount: asQuestioner.reviewsCount,
          },
        },
        canRequest: canRequestInfo.canRequest,
        canRequestReason: canRequestInfo.reason,
        existingRequestId: canRequestInfo.existingRequestId,
        viewerRequest,
      },
    });
  } catch (error) {
    console.error('getQuestionDetail error:', error);
    return res.status(500).json({ error: 'Failed to fetch question detail' });
  }
};

/**
 * GET /questions/:id/rejected-responders — questioner-only list of blocked responders.
 */
export const getRejectedResponders = async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    if (question.userId !== userId) {
      return res.status(403).json({ error: 'Only the questioner can view rejected responders' });
    }

    const blocks = await prisma.questionResponderBlock.findMany({
      where: { questionId: id, removedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        responder: {
          select: { id: true, name: true, username: true, profileImageUrl: true },
        },
      },
    });

    const items = blocks.map((b) => ({
      responderId: b.responderId,
      rejectionReason: b.rejectionReason,
      rejectedAt: b.createdAt.toISOString(),
      responder: b.responder,
    }));

    return res.status(200).json({ message: 'Successful', data: { items } });
  } catch (error) {
    console.error('getRejectedResponders error:', error);
    return res.status(500).json({ error: 'Failed to fetch rejected responders' });
  }
};

/**
 * DELETE /questions/:id/rejected-responders/:responderId
 * Questioner-only. Unblocks responder and deletes rejected request so they can re-request.
 */
export const unblockResponder = async (req: AuthedRequest, res: Response) => {
  try {
    const { id: questionId, responderId } = req.params;
    const userId = req.user!.userId;

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    if (question.userId !== userId) {
      return res.status(403).json({ error: 'Only the questioner can unblock responders' });
    }

    const block = await prisma.questionResponderBlock.findFirst({
      where: { questionId, responderId, removedAt: null },
    });
    if (!block) {
      return res.status(404).json({ error: 'Responder is not on the rejected list' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.questionResponderBlock.update({
        where: { id: block.id },
        data: { removedAt: new Date() },
      });

      if (block.answerRequestId) {
        await tx.answerRequest.delete({ where: { id: block.answerRequestId } });
      }
    });

    return res.status(200).json({ message: 'Responder can request again' });
  } catch (error) {
    console.error('unblockResponder error:', error);
    return res.status(500).json({ error: 'Failed to unblock responder' });
  }
};

/**
 * POST /questions/:id/answered — questioner-only.
 * Marks question ANSWERED and closes all PENDING requests with CLOSED_ANSWERED.
 * Emits `question:answered` + a closing SYSTEM message to each affected responder.
 */
export const markQuestionAnswered = async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    if (question.userId !== userId) {
      return res.status(403).json({ error: 'Only the questioner can mark this question as answered' });
    }
    if (question.status === QuestionStatus.ANSWERED) {
      return res.status(200).json({ message: 'Question already marked as answered' });
    }
    if (question.status === QuestionStatus.CANCELLED) {
      return res.status(409).json({ error: 'Cannot mark a cancelled question as answered' });
    }

    const now = new Date();
    const [updated, pendingRequests] = await Promise.all([
      prisma.question.update({
        where: { id },
        data: { status: QuestionStatus.ANSWERED, answeredAt: now },
      }),
      prisma.answerRequest.findMany({
        where: { questionId: id, status: AnswerRequestStatus.PENDING },
        select: { id: true, responderId: true },
      }),
    ]);

    if (pendingRequests.length > 0) {
      await prisma.answerRequest.updateMany({
        where: { id: { in: pendingRequests.map((r) => r.id) } },
        data: { status: AnswerRequestStatus.CLOSED_ANSWERED, respondedAt: now },
      });

      await Promise.all(
        pendingRequests.map((r) =>
          createSystemMessage({
            questionId: id,
            answerRequestId: r.id,
            senderId: userId,
            text: 'Question has been answered.',
            visibleToUserId: r.responderId,
          }).catch((err) =>
            console.error('markQuestionAnswered system message failed', err),
          ),
        ),
      );
    }

    const payload = { questionId: id, status: QuestionStatus.ANSWERED, answeredAt: now.toISOString() };
    emitToUser(userId, 'question:answered', payload);
    for (const r of pendingRequests) {
      emitToUser(r.responderId, 'question:answered', payload);
    }

    return res.status(200).json({
      message: 'Question marked as answered',
      data: { id: updated.id, status: updated.status, answeredAt: updated.answeredAt?.toISOString() ?? null },
    });
  } catch (error) {
    console.error('markQuestionAnswered error:', error);
    return res.status(500).json({ error: 'Failed to mark question as answered' });
  }
};

/**
 * DELETE /questions/:id — questioner-only. Marks CANCELLED. Idempotent.
 */
export const cancelQuestion = async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    if (question.userId !== userId) {
      return res.status(403).json({ error: 'Only the questioner can cancel this question' });
    }
    if (question.status === QuestionStatus.CANCELLED) {
      return res.status(200).json({ message: 'Question already cancelled' });
    }

    const now = new Date();
    const [updated, openRequests] = await Promise.all([
      prisma.question.update({
        where: { id },
        data: { status: QuestionStatus.CANCELLED },
      }),
      prisma.answerRequest.findMany({
        where: { questionId: id, status: AnswerRequestStatus.PENDING },
        select: { id: true, responderId: true },
      }),
    ]);

    if (openRequests.length > 0) {
      await prisma.answerRequest.updateMany({
        where: { id: { in: openRequests.map((r) => r.id) } },
        data: { status: AnswerRequestStatus.CLOSED_ANSWERED, respondedAt: now },
      });
    }

    const payload = { questionId: id, status: QuestionStatus.CANCELLED };
    emitToUser(userId, 'question:cancelled', payload);
    for (const r of openRequests) {
      emitToUser(r.responderId, 'question:cancelled', payload);
    }

    return res.status(200).json({
      message: 'Question cancelled',
      data: { id: updated.id, status: updated.status },
    });
  } catch (error) {
    console.error('cancelQuestion error:', error);
    return res.status(500).json({ error: 'Failed to cancel question' });
  }
};

// Re-exported for tests / future callers.
export { computeCanRequest, invalidateUserRatingCache };
export type { CanRequestReason };
