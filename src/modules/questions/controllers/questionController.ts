import { AnswerRequestStatus, LocationScope, Prisma, QuestionStatus } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import { emitToUser } from '../../../core/socket/socket.server';
import { notifyUser, notifyUsers } from '../../../common/utils/notify';
import { calculateHaversineDistance } from '../../../common/utils/geo.utils';
import { getScopeRadiusKm, isWithinScope } from '../../../common/utils/locationScope.utils';
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
  getMarketConfigValue,
  MARKET_CONFIG_KEYS,
  getQuestionNewLocationFreshnessHours,
} from '../../../modules/config/configService';
import {
  buildViewerRequestSummary,
  getActiveBlock,
  loadViewerRequestMap,
  buildAwaitingApprovalFeedQuestions,
  loadQuestionFeedAttentionMap,
  getQuestionFeedAttention,
  ViewerRequestSummary,
} from '../../../common/utils/requestViewer.utils';
import { sortQuestionFeedByDefaultPriority } from '../../../common/utils/questionFeedSort.utils';

type AuthedRequest = Request & { user?: { userId: string; }; };

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
  locationScope: q.locationScope,
  status: q.status,
  createdAt: q.createdAt.toISOString(),
  answeredAt: q.answeredAt?.toISOString() ?? null,
  closedAt: q.closedAt?.toISOString() ?? null,
  closeReason: q.closeReason ?? null,
  category: q.category,
  questioner: q.user && {
    id: q.user.id,
    name: q.user.name,
    username: q.user.username,
    profileImageUrl: q.user.profileImageUrl,
  },
});

export const PRESET_CLOSE_REASONS = [
  'Question answered',
  'No longer need the information',
  'Found the answer elsewhere',
  'Posted by mistake',
  'Price or terms no longer work',
] as const;

export const CLOSE_REASON_QUESTION_ANSWERED = PRESET_CLOSE_REASONS[0];

/**
 * Hard ceiling on fan-out recipients per question, bounding push cost.
 */
const QUESTION_NEW_MAX_RECIPIENTS = 500;

/**
 * Fan out a `question:new` socket event + push to users who can act on the
 * new question. Mirrors the feed's eligibility rule: the viewer must be
 * inside the question's location scope. Targets each user's last reported
 * location row (written by PUT /users/location as the app reads foreground
 * GPS; the feed itself deliberately uses live GPS instead).
 *
 * Freshness: only locations reported within
 * `questionNewLocationFreshnessHours` (market config; default 24h) are
 * considered. A question about a place is time-sensitive, so if the user
 * has closed the app, travelled, or simply not been around today, we don't
 * ping the old spot.
 *
 * Scale path: the DB narrows candidates with an indexed bounding-box range
 * filter (locations.latitude/longitude composite index) plus the freshness
 * cutoff, so we never load more than QUESTION_NEW_MAX_RECIPIENTS rows; the
 * precise haversine check then runs in JS on that small set. ANYWHERE has
 * no radius, so it leans on the freshness cutoff + cap alone.
 */
async function notifyQuestionCreated(q: {
  id: string;
  authorId: string;
  title: string;
  price: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  locationScope: LocationScope;
  categoryName: string | null;
  createdAt: Date;
}): Promise<void> {
  try {
    const radiusKm = await getScopeRadiusKm(q.locationScope);
    const hasCoords = q.latitude != null && q.longitude != null;
    const freshnessHours = await getQuestionNewLocationFreshnessHours();
    const freshnessCutoff = new Date(Date.now() - freshnessHours * 3_600_000);

    // Bounding box: 1° latitude ≈ 111.32 km; longitude degrees shrink with
    // the cosine of latitude (clamped so polar/edge cases stay sane).
    let boundingBox: { gte: number; lte: number; } | undefined;
    let lngBox: { gte: number; lte: number; } | undefined;
    if (radiusKm != null && hasCoords) {
      const latDelta = radiusKm / 111.32;
      const lngDelta = radiusKm / (111.32 * Math.max(Math.cos((q.latitude as number) * Math.PI / 180), 0.01));
      boundingBox = { gte: (q.latitude as number) - latDelta, lte: (q.latitude as number) + latDelta };
      lngBox = { gte: (q.longitude as number) - lngDelta, lte: (q.longitude as number) + lngDelta };
    }

    const candidates = await prisma.user.findMany({
      where: {
        id: { not: q.authorId },
        notificationsEnabled: true,
        locationSharingEnabled: true,
        location: {
          // Filtering on the relation's fields also implies the row exists.
          updatedAt: { gte: freshnessCutoff },
          ...(boundingBox && lngBox
            ? { latitude: boundingBox, longitude: lngBox }
            : {}),
        },
      },
      select: {
        id: true,
        location: { select: { latitude: true, longitude: true } },
      },
      // Deterministic order so the cap truncates predictably (and favours the
      // most recently active locations) instead of an arbitrary 500 rows.
      orderBy: { location: { updatedAt: 'desc' } },
      take: QUESTION_NEW_MAX_RECIPIENTS,
    });

    const recipientIds = candidates
      .filter((u) => {
        if (!u.location) return false;
        // ANYWHERE (or an ungateable question) has no radius — the SQL
        // filters above already applied freshness + cap.
        if (radiusKm == null || !hasCoords) return true;
        const distanceKm = calculateHaversineDistance(
          q.latitude as number,
          q.longitude as number,
          u.location.latitude,
          u.location.longitude,
        );
        return distanceKm <= radiusKm;
      })
      .map((u) => u.id);

    if (recipientIds.length === 0) return;

    const socketPayload = {
      id: q.id,
      title: q.title,
      price: q.price,
      latitude: q.latitude,
      longitude: q.longitude,
      address: q.address,
      locationScope: q.locationScope,
      category: q.categoryName ? { name: q.categoryName } : null,
      createdAt: q.createdAt.toISOString(),
    };
    const price = `$${q.price}`;
    notifyUsers(recipientIds, 'question:new', socketPayload, {
      title: 'New question near you',
      body: `${q.title} · ${price}`,
      data: { type: 'question:new', questionId: q.id },
    });
  } catch (err) {
    console.error('notifyQuestionCreated failed', err);
  }
}

const MAX_CLOSE_REASON_LENGTH = 500;

/**
 * GET /questions/close-reasons
 * Returns preset close reasons for the close-question modal.
 */
export const getCloseReasons = async (_req: AuthedRequest, res: Response) => {
  return res.status(200).json({
    message: 'Successful',
    data: { items: PRESET_CLOSE_REASONS },
  });
};

/**
 * POST /questions — create a question.
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
      locationScope,
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
        locationScope: locationScope ?? 'ANYWHERE',
        userId: req.user!.userId,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    await invalidateNearbyQuestionsCache().catch((err) =>
      console.error('createQuestion cache invalidation failed', err),
    );

    // Real-time fan-out: ping in-scope nearby users so the new question
    // surfaces on their Home feed + as a push without a manual refresh.
    void notifyQuestionCreated({
      id: question.id,
      authorId: question.userId,
      title: question.title,
      price: question.price,
      latitude: question.latitude,
      longitude: question.longitude,
      address: question.address,
      locationScope: question.locationScope,
      categoryName: question.category?.name ?? null,
      createdAt: question.createdAt,
    });

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
 * Authenticated viewers receive a flat feed with incoming/outgoing counts.
 * Filters:
 *   ?lat=&lng=           viewer coords (enables distance + nearMe flag).
 *                        Required when nearMe=true — without coords, near-me
 *                        returns an empty list (the FE prompts the user to
 *                        enable their location).
 *   ?nearMe=true         restrict to incoming questions within the market-wide
 *                        near-me radius of the viewer
 *   ?page=&limit=        pagination (flat feed only)
 */
export const getQuestionFeed = async (req: AuthedRequest, res: Response) => {
  try {
    const viewerId = req.user?.userId;
    const { page, limit, skip } = parsePagination(req.query);
    const lat = req.query.lat != null ? parseFloat(String(req.query.lat)) : NaN;
    const lng = req.query.lng != null ? parseFloat(String(req.query.lng)) : NaN;
    const filterByNearMe = String(req.query.nearMe ?? '').toLowerCase() === 'true';
    const clientPassedCoords = !Number.isNaN(lat) && !Number.isNaN(lng);
    const effectiveLat = lat;
    const effectiveLng = lng;
    const viewerHasCoords = clientPassedCoords;

    // Viewer position comes only from live GPS sent by the client (lat/lng query
    // params). We never fall back to the saved locations row — stale coords
    // must not drive distance, nearMe, or canRequest.

    // Near-me filter requires the viewer's live coords. Without them, the
    // filter returns an empty list (per the UX spec — the FE shows an
    // "enable your location" prompt instead).
    if (filterByNearMe && !viewerHasCoords) {
      const closedCount = viewerId
        ? await prisma.question.count({
          where: { userId: viewerId, status: QuestionStatus.CLOSED },
        })
        : 0;
      const empty = viewerId
        ? { items: [] as any[], counts: { all: 0, incoming: 0, outgoing: 0, closed: closedCount } }
        : { items: [] as any[], pagination: { page, limit, total: 0, hasMore: false } };
      return res.status(200).json({ message: 'Successful', data: empty });
    }

    if (!viewerId && !viewerHasCoords && page === 1) {
      const key = `feed:open:p1:limit${limit}`;
      const cached = await getCachedNearbyQuestions<any>(key);
      if (cached) {
        return res.status(200).json({ message: 'Successful (cached)', data: cached });
      }
    }

    const nearMeRadiusKm = await getMarketConfigValue(MARKET_CONFIG_KEYS.nearMeRadiusKm);

    const where: Prisma.QuestionWhereInput = {
      status: QuestionStatus.OPEN,
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

    const enriched = await Promise.all(rows.map(async (q) => {
      const item: any = { ...publicQuestionShape(q), userId: q.userId };
      let nearMe = false;
      if (viewerHasCoords && q.latitude != null && q.longitude != null) {
        const distanceKm = calculateHaversineDistance(
          effectiveLat,
          effectiveLng,
          q.latitude,
          q.longitude,
        );
        item.distanceKm = Number(distanceKm.toFixed(2));
        nearMe = distanceKm <= nearMeRadiusKm;
      } else {
        item.distanceKm = null;
      }
      item.nearMe = nearMe;

      // `eligible` answers "can this viewer actually respond" (scope gate),
      // as opposed to `nearMe`, which is just the browse radius.
      const scopeCheck = await isWithinScope({
        scope: q.locationScope,
        questionLat: q.latitude,
        questionLng: q.longitude,
        viewerLat: viewerHasCoords ? effectiveLat : null,
        viewerLng: viewerHasCoords ? effectiveLng : null,
      });
      item.eligible = scopeCheck.ok;

      const viewerRequest = requestMap.get(q.id) ?? null;
      if (viewerRequest) {
        item.viewerRequest = viewerRequest;
      }

      return item;
    }));

    const visible = filterByNearMe
      ? enriched.filter((q: any) => {
        if (q.distanceKm == null || q.latitude == null || q.longitude == null) {
          return false;
        }
        if (viewerId && q.userId === viewerId) {
          return false;
        }
        return q.distanceKm <= nearMeRadiusKm;
      })
      : enriched;

    if (viewerId) {
      const awaitingApproval = await buildAwaitingApprovalFeedQuestions(viewerId);
      const awaitingByQuestionId = new Map(
        awaitingApproval.map(({ question, incomingRequest }) => [
          question.id,
          { incomingRequest },
        ]),
      );

      const items = visible.map((item: any) => {
        const awaiting = awaitingByQuestionId.get(item.id);
        if (!awaiting) return item;
        return {
          ...item,
          incomingRequest: awaiting.incomingRequest,
        };
      });

      const attentionMap = await loadQuestionFeedAttentionMap(
        viewerId,
        items.map((item: any) => ({ id: item.id, userId: item.userId })),
      );

      const itemsWithAttention = items.map((item: any) => ({
        ...item,
        feedAttention: getQuestionFeedAttention(attentionMap, item.id),
      }));

      const sortedItems = filterByNearMe
        ? itemsWithAttention
        : sortQuestionFeedByDefaultPriority(itemsWithAttention, viewerId);

      const incoming = sortedItems.filter((item: any) => item.userId !== viewerId).length;
      const outgoing = sortedItems.filter((item: any) => item.userId === viewerId).length;
      const closed = await prisma.question.count({
        where: { userId: viewerId, status: QuestionStatus.CLOSED },
      });

      return res.status(200).json({
        message: 'Successful',
        data: {
          items: sortedItems,
          counts: {
            all: sortedItems.length,
            incoming,
            outgoing,
            closed,
          },
        },
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

    if (!viewerHasCoords && page === 1) {
      const key = `feed:open:p1:limit${limit}`;
      await setCachedNearbyQuestions(key, response).catch(() => { });
    }

    return res.status(200).json({ message: 'Successful', data: response });
  } catch (error) {
    console.error('getQuestionFeed error:', error);
    return res.status(500).json({ error: 'Failed to fetch question feed' });
  }
};

const MAX_SEARCH_RESULTS = 30;
const MIN_QUERY_LENGTH = 2;

type RawSearchHit = {
  id: string;
  title: string;
  detail: string;
  acceptanceCriteria: string;
  price: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  locationScope: string;
  status: QuestionStatus;
  createdAt: Date;
  answeredAt: Date | null;
  categoryId: string;
  userId: string;
  questionerName: string;
  questionerUsername: string;
  questionerProfileImageUrl: string | null;
  categoryName: string;
  categorySlug: string;
  similarity: number;
};

/**
 * GET /questions/search?q=
 * Fuzzy, status-agnostic search across question title/detail/acceptanceCriteria/address
 * AND the questioner's name/username/email. Uses Postgres pg_trgm similarity()
 * so mild typos still match. Results are ranked by trigram similarity (desc).
 *
 * Auth is optional: authenticated viewers get viewerRequest enrichment per item,
 * mirroring the shape returned by /questions/feed.
 */
export const searchQuestions = async (req: AuthedRequest, res: Response) => {
  try {
    const viewerId = req.user?.userId;
    const rawQuery = String(req.query.q ?? '').trim();

    if (rawQuery.length < MIN_QUERY_LENGTH) {
      return res.status(200).json({
        message: 'Successful',
        data: { items: [] as any[], query: rawQuery },
      });
    }

    // Lower the similarity threshold so mild typos still qualify.
    // Must be in the same statement as the search — SET LOCAL in a separate
    // prisma call does not apply to the follow-up queryRaw.
    const hits = await prisma.$queryRaw<RawSearchHit[]>`
      WITH ranked AS (
        SELECT
          q.*,
          c.name  AS "categoryName",
          c.slug  AS "categorySlug",
          u.name  AS "questionerName",
          u.username AS "questionerUsername",
          u."profileImageUrl" AS "questionerProfileImageUrl",
          GREATEST(
            similarity(q.title,              ${rawQuery}),
            similarity(q.detail,             ${rawQuery}),
            similarity(q."acceptanceCriteria", ${rawQuery}),
            similarity(q.address,            ${rawQuery}),
            similarity(u.name,               ${rawQuery}),
            similarity(u.username,           ${rawQuery}),
            similarity(u.email,              ${rawQuery})
          ) AS similarity
        FROM "questions" q
        JOIN "users" u      ON u.id = q."userId"
        JOIN "categories" c ON c.id = q."categoryId"
        WHERE q.status = 'OPEN'
          AND (
             similarity(q.title,                ${rawQuery}) >= 0.1
          OR similarity(q.detail,               ${rawQuery}) >= 0.1
          OR similarity(q."acceptanceCriteria",  ${rawQuery}) >= 0.1
          OR similarity(q.address,              ${rawQuery}) >= 0.1
          OR similarity(u.name,                 ${rawQuery}) >= 0.1
          OR similarity(u.username,             ${rawQuery}) >= 0.1
          OR similarity(u.email,                ${rawQuery}) >= 0.1
          OR q.title               ILIKE '%' || ${rawQuery} || '%'
          OR q.detail              ILIKE '%' || ${rawQuery} || '%'
          OR q."acceptanceCriteria" ILIKE '%' || ${rawQuery} || '%'
          OR q.address             ILIKE '%' || ${rawQuery} || '%'
          OR u.name                ILIKE '%' || ${rawQuery} || '%'
          OR u.username            ILIKE '%' || ${rawQuery} || '%'
          OR u.email               ILIKE '%' || ${rawQuery} || '%'
          )
      )
      SELECT * FROM ranked
      WHERE similarity >= 0.1
         OR title               ILIKE '%' || ${rawQuery} || '%'
         OR detail              ILIKE '%' || ${rawQuery} || '%'
         OR "acceptanceCriteria" ILIKE '%' || ${rawQuery} || '%'
         OR address             ILIKE '%' || ${rawQuery} || '%'
         OR "questionerName"    ILIKE '%' || ${rawQuery} || '%'
         OR "questionerUsername" ILIKE '%' || ${rawQuery} || '%'
      ORDER BY similarity DESC, "createdAt" DESC
      LIMIT ${MAX_SEARCH_RESULTS};
    `;

    if (hits.length === 0) {
      return res.status(200).json({
        message: 'Successful',
        data: { items: [] as any[], query: rawQuery },
      });
    }

    const questionIds = hits.map((h) => h.id);
    const { requestMap } = viewerId
      ? await loadViewerRequestMap(viewerId, questionIds)
      : { requestMap: new Map<string, ViewerRequestSummary>() };

    const attentionMap = viewerId
      ? await loadQuestionFeedAttentionMap(
        viewerId,
        hits.map((h) => ({ id: h.id, userId: h.userId })),
      )
      : new Map();

    const items = hits.map((h) => {
      const item: any = {
        id: h.id,
        title: h.title,
        detail: h.detail,
        acceptanceCriteria: h.acceptanceCriteria,
        price: h.price,
        latitude: h.latitude,
        longitude: h.longitude,
        address: h.address,
        locationScope: h.locationScope,
        status: h.status,
        createdAt: h.createdAt.toISOString(),
        answeredAt: h.answeredAt?.toISOString() ?? null,
        category: { id: h.categoryId, name: h.categoryName, slug: h.categorySlug },
        questioner: {
          id: h.userId,
          name: h.questionerName,
          username: h.questionerUsername,
          profileImageUrl: h.questionerProfileImageUrl,
        },
        similarity: Number(Number(h.similarity).toFixed(3)),
      };

      const viewerRequest = requestMap.get(h.id) ?? null;
      if (viewerRequest) {
        item.viewerRequest = viewerRequest;
      }
      if (viewerId) {
        item.feedAttention = getQuestionFeedAttention(attentionMap, h.id);
      }
      return item;
    });

    return res.status(200).json({
      message: 'Successful',
      data: { items, query: rawQuery },
    });
  } catch (error) {
    console.error('searchQuestions error:', error);
    return res.status(500).json({ error: 'Failed to search questions' });
  }
};

/**
 * GET /questions/mine/closed — questioner's own CLOSED questions (not on the public feed).
 */
export const getUserClosedQuestions = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const questions = await prisma.question.findMany({
      where: { userId, status: QuestionStatus.CLOSED },
      orderBy: [{ closedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    const items = questions.map((q) => ({
      ...publicQuestionShape(q),
      userId: q.userId,
    }));

    return res.status(200).json({
      message: 'Successful',
      data: { items, count: items.length },
    });
  } catch (error) {
    console.error('getUserClosedQuestions error:', error);
    return res.status(500).json({ error: 'Failed to fetch closed questions' });
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
  | 'CLOSED'
  | 'OWN_QUESTION'
  | 'NO_VIEWER_LOCATION';

const computeCanRequest = async (
  question: {
    id: string;
    userId: string;
    status: QuestionStatus;
    latitude: number | null;
    longitude: number | null;
    locationScope: LocationScope;
  },
  viewer: { userId: string; latitude?: number | null; longitude?: number | null; } | null,
): Promise<{ canRequest: boolean; reason: CanRequestReason | null; existingRequestId: string | null; }> => {
  if (question.userId === viewer?.userId) {
    return { canRequest: false, reason: 'OWN_QUESTION', existingRequestId: null };
  }
  if (question.status === QuestionStatus.CLOSED) {
    return { canRequest: false, reason: 'CLOSED', existingRequestId: null };
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

  // Distance gate only when the question's scope demands one. The radius
  // resolves live from market-wide config (single source of truth).
  if (question.locationScope !== 'ANYWHERE') {
    const scopeCheck = await isWithinScope({
      scope: question.locationScope,
      questionLat: question.latitude,
      questionLng: question.longitude,
      viewerLat: viewer?.latitude,
      viewerLng: viewer?.longitude,
    });
    if (!scopeCheck.ok) {
      return { canRequest: false, reason: scopeCheck.reason!, existingRequestId };
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
    const queryLat = req.query.lat != null ? parseFloat(String(req.query.lat)) : NaN;
    const queryLng = req.query.lng != null ? parseFloat(String(req.query.lng)) : NaN;
    const hasQueryCoords = !Number.isNaN(queryLat) && !Number.isNaN(queryLng);

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

    if (question.status === QuestionStatus.CLOSED && viewerId !== question.userId) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Viewer position comes only from live GPS query params — never the saved
    // locations row.
    let viewerWithCoords: { userId: string; latitude: number | null; longitude: number | null; } | null = null;
    if (viewerId) {
      const latitude = hasQueryCoords ? queryLat : null;
      const longitude = hasQueryCoords ? queryLng : null;
      viewerWithCoords = { userId: viewerId, latitude, longitude };
    }

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

    const nearMeRadiusKm = await getMarketConfigValue(MARKET_CONFIG_KEYS.nearMeRadiusKm);

    let distanceKm: number | null = null;
    let nearMe = false;
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
      nearMe = distanceKm <= nearMeRadiusKm;
    }

    // Scope gate for this viewer — drives the "within X m" copy client-side.
    const scopeCheck = await isWithinScope({
      scope: question.locationScope,
      questionLat: question.latitude,
      questionLng: question.longitude,
      viewerLat: viewerWithCoords?.latitude,
      viewerLng: viewerWithCoords?.longitude,
    });

    return res.status(200).json({
      message: 'Successful',
      data: {
        ...publicQuestionShape(question),
        userId: question.userId,
        distanceKm,
        nearMe,
        eligible: scopeCheck.ok,
        scopeRadiusKm: scopeCheck.radiusKm,
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
      return res.status(403).json({ error: 'Only the questioner can view declined responders' });
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

    const responderIds = [...new Set(blocks.map((b) => b.responderId))];
    const responderRatings = await Promise.all(
      responderIds.map((id) => getUserRatingByRole(id, RatingRole.AS_RESPONDER)),
    );
    const ratingByResponderId = new Map(
      responderIds.map((id, index) => [id, responderRatings[index]]),
    );

    const items = blocks.map((b) => {
      const rating = ratingByResponderId.get(b.responderId)!;
      return {
        responderId: b.responderId,
        rejectionReason: b.rejectionReason,
        rejectedAt: b.createdAt.toISOString(),
        responder: {
          ...b.responder,
          asResponder: {
            averageRating: rating.averageRating,
            reviewsCount: rating.reviewsCount,
          },
        },
      };
    });

    return res.status(200).json({ message: 'Successful', data: { items } });
  } catch (error) {
    console.error('getRejectedResponders error:', error);
    return res.status(500).json({ error: 'Failed to fetch declined responders' });
  }
};

/**
 * DELETE /questions/:id/rejected-responders/:responderId
 * Questioner-only. Unblocks responder and deletes declined request so they can re-request.
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
      return res.status(404).json({ error: 'Responder is not on the declined list' });
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
 * POST /questions/:id/close — questioner-only.
 * Marks question CLOSED with a reason, closes pending requests, and emits `question:closed`.
 */
export const closeQuestion = async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    if (!reason) {
      return res.status(400).json({ error: 'A close reason is required' });
    }
    if (reason.length > MAX_CLOSE_REASON_LENGTH) {
      return res.status(400).json({ error: 'Close reason is too long' });
    }

    const question = await prisma.question.findUnique({ where: { id } });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    if (question.userId !== userId) {
      return res.status(403).json({ error: 'Only the questioner can close this question' });
    }
    if (question.status === QuestionStatus.CLOSED) {
      return res.status(200).json({
        message: 'Question already closed',
        data: {
          id: question.id,
          status: question.status,
          closeReason: question.closeReason,
          closedAt: question.closedAt?.toISOString() ?? null,
          answeredAt: question.answeredAt?.toISOString() ?? null,
        },
      });
    }

    const now = new Date();
    const isAnsweredClose = reason === CLOSE_REASON_QUESTION_ANSWERED;
    const systemMessageText = isAnsweredClose
      ? 'Question has been answered.'
      : 'Question has been closed.';

    const [updated, pendingRequests] = await Promise.all([
      prisma.question.update({
        where: { id },
        data: {
          status: QuestionStatus.CLOSED,
          closeReason: reason,
          closedAt: now,
          answeredAt: isAnsweredClose ? now : question.answeredAt,
        },
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
            text: systemMessageText,
            visibleToUserId: r.responderId,
          }).catch((err) => console.error('closeQuestion system message failed', err)),
        ),
      );
    }

    const payload = {
      questionId: id,
      status: QuestionStatus.CLOSED,
      closeReason: reason,
      closedAt: now.toISOString(),
      answeredAt: updated.answeredAt?.toISOString() ?? null,
    };
    emitToUser(userId, 'question:closed', payload);
    for (const r of pendingRequests) {
      notifyUser({
        userId: r.responderId,
        event: 'question:closed',
        payload,
        push: {
          title: 'Question closed',
          body: `“${question.title}” was closed${isAnsweredClose ? ' — it has been answered' : ''}`,
          data: { type: 'question:closed', questionId: id },
        },
      });
    }

    return res.status(200).json({
      message: 'Question closed',
      data: {
        id: updated.id,
        status: updated.status,
        closeReason: updated.closeReason,
        closedAt: updated.closedAt?.toISOString() ?? null,
        answeredAt: updated.answeredAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('closeQuestion error:', error);
    return res.status(500).json({ error: 'Failed to close question' });
  }
};

// Re-exported for tests / future callers.
export { computeCanRequest, invalidateUserRatingCache };
export type { CanRequestReason };
