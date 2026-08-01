"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateUserRatingCache = exports.computeCanRequest = exports.closeQuestion = exports.unblockResponder = exports.getRejectedResponders = exports.getQuestionDetail = exports.getUserPostedQuestions = exports.getUserClosedQuestions = exports.searchQuestions = exports.getQuestionFeed = exports.createQuestion = exports.getCloseReasons = exports.CLOSE_REASON_QUESTION_ANSWERED = exports.PRESET_CLOSE_REASONS = void 0;
const client_1 = require("@prisma/client");
const client_2 = __importDefault(require("../../../core/database/prisma/client"));
const socket_server_1 = require("../../../core/socket/socket.server");
const geo_utils_1 = require("../../../common/utils/geo.utils");
const messages_utils_1 = require("../../../common/utils/messages.utils");
const ratings_1 = require("../../../common/utils/ratings");
Object.defineProperty(exports, "invalidateUserRatingCache", { enumerable: true, get: function () { return ratings_1.invalidateUserRatingCache; } });
const client_3 = require("@prisma/client");
const cache_1 = require("../../../common/utils/cache");
const configService_1 = require("../../../modules/config/configService");
const requestViewer_utils_1 = require("../../../common/utils/requestViewer.utils");
const questionFeedSort_utils_1 = require("../../../common/utils/questionFeedSort.utils");
const DEFAULT_FEED_PAGE_SIZE = 20;
const MAX_FEED_PAGE_SIZE = 50;
const parsePagination = (query) => {
    const page = Math.max(parseInt(String(query.page || '1'), 10), 1);
    const limit = Math.min(Math.max(parseInt(String(query.limit || String(DEFAULT_FEED_PAGE_SIZE)), 10), 1), MAX_FEED_PAGE_SIZE);
    return { page, limit, skip: (page - 1) * limit };
};
const publicQuestionShape = (q) => {
    var _a, _b, _c, _d, _e;
    return ({
        id: q.id,
        title: q.title,
        detail: q.detail,
        price: q.price,
        acceptanceCriteria: q.acceptanceCriteria,
        latitude: q.latitude,
        longitude: q.longitude,
        address: q.address,
        restrictToNearby: q.restrictToNearby,
        status: q.status,
        createdAt: q.createdAt.toISOString(),
        answeredAt: (_b = (_a = q.answeredAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
        closedAt: (_d = (_c = q.closedAt) === null || _c === void 0 ? void 0 : _c.toISOString()) !== null && _d !== void 0 ? _d : null,
        closeReason: (_e = q.closeReason) !== null && _e !== void 0 ? _e : null,
        category: q.category,
        questioner: q.user && {
            id: q.user.id,
            name: q.user.name,
            username: q.user.username,
            profileImageUrl: q.user.profileImageUrl,
        },
    });
};
exports.PRESET_CLOSE_REASONS = [
    'Question answered',
    'No longer need the information',
    'Found the answer elsewhere',
    'Posted by mistake',
    'Price or terms no longer work',
];
exports.CLOSE_REASON_QUESTION_ANSWERED = exports.PRESET_CLOSE_REASONS[0];
const MAX_CLOSE_REASON_LENGTH = 500;
/**
 * GET /questions/close-reasons
 * Returns preset close reasons for the close-question modal.
 */
const getCloseReasons = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    return res.status(200).json({
        message: 'Successful',
        data: { items: exports.PRESET_CLOSE_REASONS },
    });
});
exports.getCloseReasons = getCloseReasons;
/**
 * POST /questions — create a question.
 * Body validated by validateQuestionCreation.
 */
const createQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { title, detail, categoryId, price, acceptanceCriteria, latitude, longitude, address, restrictToNearby, } = req.body;
        const question = yield client_2.default.question.create({
            data: {
                title,
                detail,
                categoryId,
                price,
                acceptanceCriteria,
                latitude: latitude !== null && latitude !== void 0 ? latitude : null,
                longitude: longitude !== null && longitude !== void 0 ? longitude : null,
                address: address !== null && address !== void 0 ? address : null,
                restrictToNearby: !!restrictToNearby,
                userId: req.user.userId,
            },
            include: { category: { select: { id: true, name: true, slug: true } } },
        });
        yield (0, cache_1.invalidateNearbyQuestionsCache)().catch((err) => console.error('createQuestion cache invalidation failed', err));
        return res.status(201).json({
            message: 'Question created successfully',
            data: Object.assign(Object.assign({}, publicQuestionShape(question)), { userId: question.userId }),
        });
    }
    catch (error) {
        console.error('createQuestion error:', error);
        return res.status(500).json({ error: 'Failed to create question' });
    }
});
exports.createQuestion = createQuestion;
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
const getQuestionFeed = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const viewerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { page, limit, skip } = parsePagination(req.query);
        const lat = req.query.lat != null ? parseFloat(String(req.query.lat)) : NaN;
        const lng = req.query.lng != null ? parseFloat(String(req.query.lng)) : NaN;
        const filterByNearMe = String((_b = req.query.nearMe) !== null && _b !== void 0 ? _b : '').toLowerCase() === 'true';
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
                ? yield client_2.default.question.count({
                    where: { userId: viewerId, status: client_1.QuestionStatus.CLOSED },
                })
                : 0;
            const empty = viewerId
                ? { items: [], counts: { all: 0, incoming: 0, outgoing: 0, closed: closedCount } }
                : { items: [], pagination: { page, limit, total: 0, hasMore: false } };
            return res.status(200).json({ message: 'Successful', data: empty });
        }
        if (!viewerId && !viewerHasCoords && page === 1) {
            const key = `feed:open:p1:limit${limit}`;
            const cached = yield (0, cache_1.getCachedNearbyQuestions)(key);
            if (cached) {
                return res.status(200).json({ message: 'Successful (cached)', data: cached });
            }
        }
        const nearMeRadiusKm = yield (0, configService_1.getMarketConfigValue)(configService_1.MARKET_CONFIG_KEYS.nearMeRadiusKm);
        const where = {
            status: client_1.QuestionStatus.OPEN,
        };
        const rows = yield client_2.default.question.findMany({
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
            ? yield (0, requestViewer_utils_1.loadViewerRequestMap)(viewerId, questionIds)
            : { requestMap: new Map() };
        const enriched = rows.map((q) => {
            var _a;
            const item = Object.assign(Object.assign({}, publicQuestionShape(q)), { userId: q.userId });
            let nearMe = false;
            if (viewerHasCoords && q.latitude != null && q.longitude != null) {
                const distanceKm = (0, geo_utils_1.calculateHaversineDistance)(effectiveLat, effectiveLng, q.latitude, q.longitude);
                item.distanceKm = Number(distanceKm.toFixed(2));
                nearMe = distanceKm <= nearMeRadiusKm;
            }
            else {
                item.distanceKm = null;
            }
            item.nearMe = nearMe;
            const viewerRequest = (_a = requestMap.get(q.id)) !== null && _a !== void 0 ? _a : null;
            if (viewerRequest) {
                item.viewerRequest = viewerRequest;
            }
            return item;
        });
        const visible = filterByNearMe
            ? enriched.filter((q) => {
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
            const awaitingApproval = yield (0, requestViewer_utils_1.buildAwaitingApprovalFeedQuestions)(viewerId);
            const awaitingByQuestionId = new Map(awaitingApproval.map(({ question, incomingRequest }) => [
                question.id,
                { incomingRequest },
            ]));
            const items = visible.map((item) => {
                const awaiting = awaitingByQuestionId.get(item.id);
                if (!awaiting)
                    return item;
                return Object.assign(Object.assign({}, item), { incomingRequest: awaiting.incomingRequest });
            });
            const attentionMap = yield (0, requestViewer_utils_1.loadQuestionFeedAttentionMap)(viewerId, items.map((item) => ({ id: item.id, userId: item.userId })));
            const itemsWithAttention = items.map((item) => (Object.assign(Object.assign({}, item), { feedAttention: (0, requestViewer_utils_1.getQuestionFeedAttention)(attentionMap, item.id) })));
            const sortedItems = filterByNearMe
                ? itemsWithAttention
                : (0, questionFeedSort_utils_1.sortQuestionFeedByDefaultPriority)(itemsWithAttention, viewerId);
            const incoming = sortedItems.filter((item) => item.userId !== viewerId).length;
            const outgoing = sortedItems.filter((item) => item.userId === viewerId).length;
            const closed = yield client_2.default.question.count({
                where: { userId: viewerId, status: client_1.QuestionStatus.CLOSED },
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
            yield (0, cache_1.setCachedNearbyQuestions)(key, response).catch(() => { });
        }
        return res.status(200).json({ message: 'Successful', data: response });
    }
    catch (error) {
        console.error('getQuestionFeed error:', error);
        return res.status(500).json({ error: 'Failed to fetch question feed' });
    }
});
exports.getQuestionFeed = getQuestionFeed;
const MAX_SEARCH_RESULTS = 30;
const MIN_QUERY_LENGTH = 2;
/**
 * GET /questions/search?q=
 * Fuzzy, status-agnostic search across question title/detail/acceptanceCriteria/address
 * AND the questioner's name/username/email. Uses Postgres pg_trgm similarity()
 * so mild typos still match. Results are ranked by trigram similarity (desc).
 *
 * Auth is optional: authenticated viewers get viewerRequest enrichment per item,
 * mirroring the shape returned by /questions/feed.
 */
const searchQuestions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const viewerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const rawQuery = String((_b = req.query.q) !== null && _b !== void 0 ? _b : '').trim();
        if (rawQuery.length < MIN_QUERY_LENGTH) {
            return res.status(200).json({
                message: 'Successful',
                data: { items: [], query: rawQuery },
            });
        }
        // Lower the similarity threshold so mild typos still qualify.
        // Must be in the same statement as the search — SET LOCAL in a separate
        // prisma call does not apply to the follow-up queryRaw.
        const hits = yield client_2.default.$queryRaw `
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
                data: { items: [], query: rawQuery },
            });
        }
        const questionIds = hits.map((h) => h.id);
        const { requestMap } = viewerId
            ? yield (0, requestViewer_utils_1.loadViewerRequestMap)(viewerId, questionIds)
            : { requestMap: new Map() };
        const attentionMap = viewerId
            ? yield (0, requestViewer_utils_1.loadQuestionFeedAttentionMap)(viewerId, hits.map((h) => ({ id: h.id, userId: h.userId })))
            : new Map();
        const items = hits.map((h) => {
            var _a, _b, _c;
            const item = {
                id: h.id,
                title: h.title,
                detail: h.detail,
                acceptanceCriteria: h.acceptanceCriteria,
                price: h.price,
                latitude: h.latitude,
                longitude: h.longitude,
                address: h.address,
                restrictToNearby: h.restrictToNearby,
                status: h.status,
                createdAt: h.createdAt.toISOString(),
                answeredAt: (_b = (_a = h.answeredAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
                category: { id: h.categoryId, name: h.categoryName, slug: h.categorySlug },
                questioner: {
                    id: h.userId,
                    name: h.questionerName,
                    username: h.questionerUsername,
                    profileImageUrl: h.questionerProfileImageUrl,
                },
                similarity: Number(Number(h.similarity).toFixed(3)),
            };
            const viewerRequest = (_c = requestMap.get(h.id)) !== null && _c !== void 0 ? _c : null;
            if (viewerRequest) {
                item.viewerRequest = viewerRequest;
            }
            if (viewerId) {
                item.feedAttention = (0, requestViewer_utils_1.getQuestionFeedAttention)(attentionMap, h.id);
            }
            return item;
        });
        return res.status(200).json({
            message: 'Successful',
            data: { items, query: rawQuery },
        });
    }
    catch (error) {
        console.error('searchQuestions error:', error);
        return res.status(500).json({ error: 'Failed to search questions' });
    }
});
exports.searchQuestions = searchQuestions;
/**
 * GET /questions/mine/closed — questioner's own CLOSED questions (not on the public feed).
 */
const getUserClosedQuestions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const questions = yield client_2.default.question.findMany({
            where: { userId, status: client_1.QuestionStatus.CLOSED },
            orderBy: [{ closedAt: 'desc' }, { createdAt: 'desc' }],
            include: {
                category: { select: { id: true, name: true, slug: true } },
            },
        });
        const items = questions.map((q) => (Object.assign(Object.assign({}, publicQuestionShape(q)), { userId: q.userId })));
        return res.status(200).json({
            message: 'Successful',
            data: { items, count: items.length },
        });
    }
    catch (error) {
        console.error('getUserClosedQuestions error:', error);
        return res.status(500).json({ error: 'Failed to fetch closed questions' });
    }
});
exports.getUserClosedQuestions = getUserClosedQuestions;
/**
 * GET /questions/mine — questioner's own questions with per-status request counts.
 */
const getUserPostedQuestions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const questions = yield client_2.default.question.findMany({
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
            const requestCounts = q.requests.reduce((acc, r) => {
                var _a;
                acc[r.status] = ((_a = acc[r.status]) !== null && _a !== void 0 ? _a : 0) + 1;
                return acc;
            }, {});
            return Object.assign(Object.assign({}, publicQuestionShape(q)), { userId: q.userId, requests: q.requests, requestCounts });
        });
        return res.status(200).json({ message: 'Successful', data });
    }
    catch (error) {
        console.error('getUserPostedQuestions error:', error);
        return res.status(500).json({ error: 'Failed to fetch questions' });
    }
});
exports.getUserPostedQuestions = getUserPostedQuestions;
const computeCanRequest = (question, viewer) => __awaiter(void 0, void 0, void 0, function* () {
    if (question.userId === (viewer === null || viewer === void 0 ? void 0 : viewer.userId)) {
        return { canRequest: false, reason: 'OWN_QUESTION', existingRequestId: null };
    }
    if (question.status === client_1.QuestionStatus.CLOSED) {
        return { canRequest: false, reason: 'CLOSED', existingRequestId: null };
    }
    let existingRequestId = null;
    if (viewer) {
        const activeBlock = yield (0, requestViewer_utils_1.getActiveBlock)(question.id, viewer.userId);
        if (activeBlock) {
            return {
                canRequest: false,
                reason: 'BLOCKED',
                existingRequestId: activeBlock.answerRequestId,
            };
        }
        const existing = yield client_2.default.answerRequest.findUnique({
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
    // Proximity check only if the question opted into near-me restriction.
    // The radius itself comes from market-wide config (single source of truth).
    if (question.restrictToNearby &&
        question.latitude != null &&
        question.longitude != null) {
        if (!viewer || viewer.latitude == null || viewer.longitude == null) {
            return { canRequest: false, reason: 'NO_VIEWER_LOCATION', existingRequestId };
        }
        const nearMeRadiusKm = yield (0, configService_1.getMarketConfigValue)(configService_1.MARKET_CONFIG_KEYS.nearMeRadiusKm);
        const distance = (0, geo_utils_1.calculateHaversineDistance)(viewer.latitude, viewer.longitude, question.latitude, question.longitude);
        if (distance > nearMeRadiusKm) {
            return { canRequest: false, reason: 'OUTSIDE_RADIUS', existingRequestId };
        }
    }
    return { canRequest: true, reason: null, existingRequestId };
});
exports.computeCanRequest = computeCanRequest;
/**
 * GET /questions/:id — public question detail.
 * Authenticated viewers get a `canRequest` verdict + their existing request status.
 * Questioner's public rating summary is included for responder due-diligence.
 */
const getQuestionDetail = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const viewerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const queryLat = req.query.lat != null ? parseFloat(String(req.query.lat)) : NaN;
        const queryLng = req.query.lng != null ? parseFloat(String(req.query.lng)) : NaN;
        const hasQueryCoords = !Number.isNaN(queryLat) && !Number.isNaN(queryLng);
        const question = yield client_2.default.question.findUnique({
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
        if (question.status === client_1.QuestionStatus.CLOSED && viewerId !== question.userId) {
            return res.status(404).json({ error: 'Question not found' });
        }
        // Viewer position comes only from live GPS query params — never the saved
        // locations row.
        let viewerWithCoords = null;
        if (viewerId) {
            const latitude = hasQueryCoords ? queryLat : null;
            const longitude = hasQueryCoords ? queryLng : null;
            viewerWithCoords = { userId: viewerId, latitude, longitude };
        }
        const canRequestInfo = yield computeCanRequest(question, viewerWithCoords);
        let viewerRequest = null;
        if (viewerId) {
            const existing = yield client_2.default.answerRequest.findUnique({
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
            const activeBlock = yield (0, requestViewer_utils_1.getActiveBlock)(id, viewerId);
            if (existing) {
                viewerRequest = yield (0, requestViewer_utils_1.buildViewerRequestSummary)(existing, viewerId, !!activeBlock);
            }
            else if (activeBlock) {
                viewerRequest = {
                    id: '',
                    status: client_1.AnswerRequestStatus.REJECTED,
                    rejectionReason: activeBlock.rejectionReason,
                    hasResponded: false,
                    unreadCount: 0,
                    isBlocked: true,
                };
            }
        }
        const [asResponder, asQuestioner] = yield Promise.all([
            (0, ratings_1.getUserRatingByRole)(question.userId, client_3.RatingRole.AS_RESPONDER),
            (0, ratings_1.getUserRatingByRole)(question.userId, client_3.RatingRole.AS_QUESTIONER),
        ]);
        const nearMeRadiusKm = yield (0, configService_1.getMarketConfigValue)(configService_1.MARKET_CONFIG_KEYS.nearMeRadiusKm);
        let distanceKm = null;
        let nearMe = false;
        if (viewerWithCoords &&
            viewerWithCoords.latitude != null &&
            viewerWithCoords.longitude != null &&
            question.latitude != null &&
            question.longitude != null) {
            distanceKm = Number((0, geo_utils_1.calculateHaversineDistance)(viewerWithCoords.latitude, viewerWithCoords.longitude, question.latitude, question.longitude).toFixed(2));
            nearMe = distanceKm <= nearMeRadiusKm;
        }
        return res.status(200).json({
            message: 'Successful',
            data: Object.assign(Object.assign({}, publicQuestionShape(question)), { userId: question.userId, distanceKm,
                nearMe, questioner: {
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
                }, canRequest: canRequestInfo.canRequest, canRequestReason: canRequestInfo.reason, existingRequestId: canRequestInfo.existingRequestId, viewerRequest }),
        });
    }
    catch (error) {
        console.error('getQuestionDetail error:', error);
        return res.status(500).json({ error: 'Failed to fetch question detail' });
    }
});
exports.getQuestionDetail = getQuestionDetail;
/**
 * GET /questions/:id/rejected-responders — questioner-only list of blocked responders.
 */
const getRejectedResponders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const question = yield client_2.default.question.findUnique({ where: { id } });
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }
        if (question.userId !== userId) {
            return res.status(403).json({ error: 'Only the questioner can view declined responders' });
        }
        const blocks = yield client_2.default.questionResponderBlock.findMany({
            where: { questionId: id, removedAt: null },
            orderBy: { createdAt: 'desc' },
            include: {
                responder: {
                    select: { id: true, name: true, username: true, profileImageUrl: true },
                },
            },
        });
        const responderIds = [...new Set(blocks.map((b) => b.responderId))];
        const responderRatings = yield Promise.all(responderIds.map((id) => (0, ratings_1.getUserRatingByRole)(id, client_3.RatingRole.AS_RESPONDER)));
        const ratingByResponderId = new Map(responderIds.map((id, index) => [id, responderRatings[index]]));
        const items = blocks.map((b) => {
            const rating = ratingByResponderId.get(b.responderId);
            return {
                responderId: b.responderId,
                rejectionReason: b.rejectionReason,
                rejectedAt: b.createdAt.toISOString(),
                responder: Object.assign(Object.assign({}, b.responder), { asResponder: {
                        averageRating: rating.averageRating,
                        reviewsCount: rating.reviewsCount,
                    } }),
            };
        });
        return res.status(200).json({ message: 'Successful', data: { items } });
    }
    catch (error) {
        console.error('getRejectedResponders error:', error);
        return res.status(500).json({ error: 'Failed to fetch declined responders' });
    }
});
exports.getRejectedResponders = getRejectedResponders;
/**
 * DELETE /questions/:id/rejected-responders/:responderId
 * Questioner-only. Unblocks responder and deletes declined request so they can re-request.
 */
const unblockResponder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id: questionId, responderId } = req.params;
        const userId = req.user.userId;
        const question = yield client_2.default.question.findUnique({ where: { id: questionId } });
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }
        if (question.userId !== userId) {
            return res.status(403).json({ error: 'Only the questioner can unblock responders' });
        }
        const block = yield client_2.default.questionResponderBlock.findFirst({
            where: { questionId, responderId, removedAt: null },
        });
        if (!block) {
            return res.status(404).json({ error: 'Responder is not on the declined list' });
        }
        yield client_2.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            yield tx.questionResponderBlock.update({
                where: { id: block.id },
                data: { removedAt: new Date() },
            });
            if (block.answerRequestId) {
                yield tx.answerRequest.delete({ where: { id: block.answerRequestId } });
            }
        }));
        return res.status(200).json({ message: 'Responder can request again' });
    }
    catch (error) {
        console.error('unblockResponder error:', error);
        return res.status(500).json({ error: 'Failed to unblock responder' });
    }
});
exports.unblockResponder = unblockResponder;
/**
 * POST /questions/:id/close — questioner-only.
 * Marks question CLOSED with a reason, closes pending requests, and emits `question:closed`.
 */
const closeQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const reason = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.reason) === 'string' ? req.body.reason.trim() : '';
        if (!reason) {
            return res.status(400).json({ error: 'A close reason is required' });
        }
        if (reason.length > MAX_CLOSE_REASON_LENGTH) {
            return res.status(400).json({ error: 'Close reason is too long' });
        }
        const question = yield client_2.default.question.findUnique({ where: { id } });
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }
        if (question.userId !== userId) {
            return res.status(403).json({ error: 'Only the questioner can close this question' });
        }
        if (question.status === client_1.QuestionStatus.CLOSED) {
            return res.status(200).json({
                message: 'Question already closed',
                data: {
                    id: question.id,
                    status: question.status,
                    closeReason: question.closeReason,
                    closedAt: (_c = (_b = question.closedAt) === null || _b === void 0 ? void 0 : _b.toISOString()) !== null && _c !== void 0 ? _c : null,
                    answeredAt: (_e = (_d = question.answeredAt) === null || _d === void 0 ? void 0 : _d.toISOString()) !== null && _e !== void 0 ? _e : null,
                },
            });
        }
        const now = new Date();
        const isAnsweredClose = reason === exports.CLOSE_REASON_QUESTION_ANSWERED;
        const systemMessageText = isAnsweredClose
            ? 'Question has been answered.'
            : 'Question has been closed.';
        const [updated, pendingRequests] = yield Promise.all([
            client_2.default.question.update({
                where: { id },
                data: {
                    status: client_1.QuestionStatus.CLOSED,
                    closeReason: reason,
                    closedAt: now,
                    answeredAt: isAnsweredClose ? now : question.answeredAt,
                },
            }),
            client_2.default.answerRequest.findMany({
                where: { questionId: id, status: client_1.AnswerRequestStatus.PENDING },
                select: { id: true, responderId: true },
            }),
        ]);
        if (pendingRequests.length > 0) {
            yield client_2.default.answerRequest.updateMany({
                where: { id: { in: pendingRequests.map((r) => r.id) } },
                data: { status: client_1.AnswerRequestStatus.CLOSED_ANSWERED, respondedAt: now },
            });
            yield Promise.all(pendingRequests.map((r) => (0, messages_utils_1.createSystemMessage)({
                questionId: id,
                answerRequestId: r.id,
                senderId: userId,
                text: systemMessageText,
                visibleToUserId: r.responderId,
            }).catch((err) => console.error('closeQuestion system message failed', err))));
        }
        const payload = {
            questionId: id,
            status: client_1.QuestionStatus.CLOSED,
            closeReason: reason,
            closedAt: now.toISOString(),
            answeredAt: (_g = (_f = updated.answeredAt) === null || _f === void 0 ? void 0 : _f.toISOString()) !== null && _g !== void 0 ? _g : null,
        };
        (0, socket_server_1.emitToUser)(userId, 'question:closed', payload);
        for (const r of pendingRequests) {
            (0, socket_server_1.emitToUser)(r.responderId, 'question:closed', payload);
        }
        return res.status(200).json({
            message: 'Question closed',
            data: {
                id: updated.id,
                status: updated.status,
                closeReason: updated.closeReason,
                closedAt: (_j = (_h = updated.closedAt) === null || _h === void 0 ? void 0 : _h.toISOString()) !== null && _j !== void 0 ? _j : null,
                answeredAt: (_l = (_k = updated.answeredAt) === null || _k === void 0 ? void 0 : _k.toISOString()) !== null && _l !== void 0 ? _l : null,
            },
        });
    }
    catch (error) {
        console.error('closeQuestion error:', error);
        return res.status(500).json({ error: 'Failed to close question' });
    }
});
exports.closeQuestion = closeQuestion;
