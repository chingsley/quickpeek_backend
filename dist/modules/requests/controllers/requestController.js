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
exports.getRequestDetail = exports.getConversations = exports.getOutgoingRequests = exports.getIncomingRequests = exports.rejectRequest = exports.acceptRequest = exports.createRequest = exports.getRejectionReasons = exports.PRESET_REJECTION_REASONS = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const client_2 = __importDefault(require("../../../core/database/prisma/client"));
const socket_server_1 = require("../../../core/socket/socket.server");
const messages_utils_1 = require("../../../common/utils/messages.utils");
const geo_utils_1 = require("../../../common/utils/geo.utils");
const ratings_1 = require("../../../common/utils/ratings");
const requestViewer_utils_1 = require("../../../common/utils/requestViewer.utils");
const configService_1 = require("../../config/configService");
const DEFAULT_LIST_PAGE_SIZE = 20;
const MAX_LIST_PAGE_SIZE = 50;
const parsePagination = (query) => {
    const page = Math.max(parseInt(String(query.page || '1'), 10), 1);
    const limit = Math.min(Math.max(parseInt(String(query.limit || String(DEFAULT_LIST_PAGE_SIZE)), 10), 1), MAX_LIST_PAGE_SIZE);
    return { page, limit, skip: (page - 1) * limit };
};
exports.PRESET_REJECTION_REASONS = [
    'Question already answered',
    'Already got a response',
    'Prefer someone closer to the specified location',
    'I no longer need the information',
    "Doesn't meet the question's requirements",
    'Looking for a verified responder',
];
/**
 * GET /requests/rejection-reasons
 * Returns the preset list of decline reasons shown in the decline modal.
 */
const getRejectionReasons = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    return res.status(200).json({
        message: 'Successful',
        data: { items: exports.PRESET_REJECTION_REASONS },
    });
});
exports.getRejectionReasons = getRejectionReasons;
const createRequestQuestionSelect = {
    userId: true,
    status: true,
    latitude: true,
    longitude: true,
    restrictToNearby: true,
    address: true,
    detail: true,
    acceptanceCriteria: true,
};
const requestQuestionSummarySelect = {
    id: true,
    title: true,
    detail: true,
    price: true,
    status: true,
    latitude: true,
    longitude: true,
    address: true,
    restrictToNearby: true,
    category: { select: { id: true, name: true, slug: true } },
};
const requestQuestionDetailSelect = Object.assign(Object.assign({}, requestQuestionSummarySelect), { acceptanceCriteria: true, userId: true });
const counterpartyUserSelect = {
    id: true,
    name: true,
    username: true,
    profileImageUrl: true,
};
const requestWithQuestionInclude = {
    question: { select: requestQuestionDetailSelect },
    responder: { select: { id: true, username: true } },
};
const incomingRequestInclude = {
    question: { select: requestQuestionSummarySelect },
    responder: { select: counterpartyUserSelect },
};
const outgoingRequestInclude = {
    question: { select: requestQuestionSummarySelect },
    questioner: { select: counterpartyUserSelect },
};
const requestSummary = (r) => {
    var _a, _b;
    return ({
        id: r.id,
        questionId: r.questionId,
        responderId: r.responderId,
        questionerId: r.questionerId,
        status: r.status,
        rejectionReason: r.rejectionReason,
        createdAt: r.createdAt.toISOString(),
        respondedAt: (_b = (_a = r.respondedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
        question: r.question && {
            id: r.question.id,
            title: r.question.title,
            detail: r.question.detail,
            price: r.question.price,
            status: r.question.status,
            latitude: r.question.latitude,
            longitude: r.question.longitude,
            address: r.question.address,
            restrictToNearby: r.question.restrictToNearby,
            category: r.question.category,
        },
        counterparty: r.counterparty,
    });
};
const fetchRequestWithQuestion = (id) => client_2.default.answerRequest.findUnique({
    where: { id },
    include: requestWithQuestionInclude,
});
/**
 * POST /questions/:id/requests
 * Responder-only. Guards: own question, already requested, closed question, outside radius.
 * On success: AnswerRequest PENDING + question-info USER messages from the questioner
 * (location, detail, acceptance criteria) + 2 role-specific SYSTEM messages + emit request:new.
 */
const createRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { id: questionId } = req.params;
        const responderId = req.user.userId;
        const question = (yield client_2.default.question.findUnique({
            where: { id: questionId },
            select: createRequestQuestionSelect,
        }));
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }
        if (question.userId === responderId) {
            return res.status(400).json({ error: 'You cannot request to answer your own question' });
        }
        if (question.status === client_1.QuestionStatus.CLOSED) {
            return res.status(409).json({ error: 'This question has been closed' });
        }
        const activeBlock = yield (0, requestViewer_utils_1.getActiveBlock)(questionId, responderId);
        if (activeBlock) {
            return res.status(403).json({
                error: 'You are blocked from requesting to answer this question',
                reason: 'BLOCKED',
            });
        }
        const existing = yield client_2.default.answerRequest.findUnique({
            where: { questionId_responderId: { questionId, responderId } },
        });
        if (existing) {
            return res.status(409).json({
                error: 'You have already requested to answer this question',
                existingRequestId: existing.id,
                existingStatus: existing.status,
            });
        }
        if (question.restrictToNearby &&
            question.latitude != null &&
            question.longitude != null) {
            const bodyLat = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.lat) != null ? parseFloat(String(req.body.lat)) : NaN;
            const bodyLng = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.lng) != null ? parseFloat(String(req.body.lng)) : NaN;
            const hasLiveCoords = !Number.isNaN(bodyLat) && !Number.isNaN(bodyLng);
            if (!hasLiveCoords) {
                return res.status(400).json({
                    error: 'Location required to request this question',
                    reason: 'NO_VIEWER_LOCATION',
                });
            }
            const nearMeRadiusKm = yield (0, configService_1.getMarketConfigValue)(configService_1.MARKET_CONFIG_KEYS.nearMeRadiusKm);
            const distance = (0, geo_utils_1.calculateHaversineDistance)(bodyLat, bodyLng, question.latitude, question.longitude);
            if (distance > nearMeRadiusKm) {
                return res.status(403).json({
                    error: `You are outside the near-me radius (${distance.toFixed(2)}km > ${nearMeRadiusKm}km)`,
                    reason: 'OUTSIDE_RADIUS',
                    distanceKm: Number(distance.toFixed(2)),
                });
            }
        }
        const responderProfile = yield client_2.default.user.findUnique({
            where: { id: responderId },
            select: { username: true },
        });
        const request = yield client_2.default.answerRequest.create({
            data: {
                questionId,
                responderId,
                questionerId: question.userId,
                status: client_1.AnswerRequestStatus.PENDING,
            },
        });
        // Question info is posted as USER messages from the questioner so it appears
        // first in the chat for both participants, before the role-specific system messages.
        yield (0, messages_utils_1.createQuestionBriefingMessages)({
            questionId,
            answerRequestId: request.id,
            questionerId: question.userId,
            responderId,
            question: {
                address: question.address,
                latitude: question.latitude,
                longitude: question.longitude,
                detail: question.detail,
                acceptanceCriteria: question.acceptanceCriteria,
            },
        });
        yield Promise.all([
            (0, messages_utils_1.createSystemMessage)({
                questionId,
                answerRequestId: request.id,
                senderId: responderId,
                text: "Your request to answer the question has been sent to the question creator. We'll let you know when they respond.",
                visibleToUserId: responderId,
            }),
            (0, messages_utils_1.createSystemMessage)({
                questionId,
                answerRequestId: request.id,
                senderId: responderId,
                text: `You have a request by @${(_c = responderProfile === null || responderProfile === void 0 ? void 0 : responderProfile.username) !== null && _c !== void 0 ? _c : 'someone'} to respond to your question. View their profile before accepting the request.`,
                visibleToUserId: question.userId,
            }),
        ]);
        (0, socket_server_1.emitToUser)(question.userId, 'request:new', {
            id: request.id,
            questionId,
            responderId,
            createdAt: request.createdAt.toISOString(),
        });
        return res.status(201).json({ message: 'Request sent', data: { id: request.id, status: request.status } });
    }
    catch (error) {
        console.error('createRequest error:', error);
        return res.status(500).json({ error: 'Failed to create request' });
    }
});
exports.createRequest = createRequest;
/**
 * POST /requests/:id/accept
 * Questioner-only. PENDING -> ACCEPTED with respondedAt; role-specific system msgs.
 */
const acceptRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const request = yield fetchRequestWithQuestion(id);
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        if (request.questionerId !== userId) {
            return res.status(403).json({ error: 'Only the questioner can accept requests' });
        }
        if (request.status !== client_1.AnswerRequestStatus.PENDING) {
            return res.status(409).json({ error: `Request is already ${request.status}` });
        }
        const now = new Date();
        const updated = yield client_2.default.answerRequest.update({
            where: { id },
            data: { status: client_1.AnswerRequestStatus.ACCEPTED, respondedAt: now },
        });
        yield (0, messages_utils_1.createSystemMessage)({
            questionId: request.questionId,
            answerRequestId: id,
            senderId: userId,
            text: `You approved @${request.responder.username} to respond`,
            visibleToUserId: userId,
        });
        yield (0, messages_utils_1.createSystemMessage)({
            questionId: request.questionId,
            answerRequestId: id,
            senderId: userId,
            text: 'Request accepted. Send your response.',
            visibleToUserId: request.responderId,
        });
        (0, socket_server_1.emitToUser)(request.responderId, 'request:accepted', {
            id,
            questionId: request.questionId,
            acceptedAt: now.toISOString(),
        });
        (0, socket_server_1.emitToUser)(userId, 'request:accepted', {
            id,
            questionId: request.questionId,
            acceptedAt: now.toISOString(),
        });
        return res.status(200).json({
            message: `You approved @${request.responder.username} to respond`,
            data: { id: updated.id, status: updated.status, respondedAt: (_b = (_a = updated.respondedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null },
        });
    }
    catch (error) {
        console.error('acceptRequest error:', error);
        return res.status(500).json({ error: 'Failed to accept request' });
    }
});
exports.acceptRequest = acceptRequest;
const rejectSchema = joi_1.default.object({
    rejectionReason: joi_1.default.string().trim().min(2).max(300).required(),
});
/**
 * POST /requests/:id/reject
 * Questioner-only. PENDING -> REJECTED with reason; role-specific system msgs.
 */
const rejectRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const { error, value } = rejectSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }
        const request = yield fetchRequestWithQuestion(id);
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        if (request.questionerId !== userId) {
            return res.status(403).json({ error: 'Only the questioner can decline requests' });
        }
        if (request.status !== client_1.AnswerRequestStatus.PENDING) {
            return res.status(409).json({ error: `Request is already ${request.status}` });
        }
        const now = new Date();
        const updated = yield client_2.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const rejected = yield tx.answerRequest.update({
                where: { id },
                data: {
                    status: client_1.AnswerRequestStatus.REJECTED,
                    rejectionReason: value.rejectionReason,
                    respondedAt: now,
                },
            });
            yield tx.questionResponderBlock.create({
                data: {
                    questionId: request.questionId,
                    responderId: request.responderId,
                    answerRequestId: id,
                    rejectionReason: value.rejectionReason,
                },
            });
            return rejected;
        }));
        yield (0, messages_utils_1.createSystemMessage)({
            questionId: request.questionId,
            answerRequestId: id,
            senderId: userId,
            text: `You declined @${request.responder.username}'s request`,
            visibleToUserId: userId,
        });
        yield (0, messages_utils_1.createSystemMessage)({
            questionId: request.questionId,
            answerRequestId: id,
            senderId: userId,
            text: `Your request was declined: ${value.rejectionReason}`,
            visibleToUserId: request.responderId,
        });
        (0, socket_server_1.emitToUser)(request.responderId, 'request:rejected', {
            id,
            questionId: request.questionId,
            rejectionReason: value.rejectionReason,
            rejectedAt: now.toISOString(),
        });
        (0, socket_server_1.emitToUser)(userId, 'request:rejected', {
            id,
            questionId: request.questionId,
            rejectionReason: value.rejectionReason,
            rejectedAt: now.toISOString(),
        });
        return res.status(200).json({
            message: 'Request declined',
            data: {
                id: updated.id,
                status: updated.status,
                rejectionReason: updated.rejectionReason,
                respondedAt: (_b = (_a = updated.respondedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
            },
        });
    }
    catch (error) {
        console.error('rejectRequest error:', error);
        return res.status(500).json({ error: 'Failed to decline request' });
    }
});
exports.rejectRequest = rejectRequest;
/**
 * GET /requests/incoming?questionId=&status=
 * Questioner's incoming requests (optionally filtered by question).
 */
const getIncomingRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const userId = req.user.userId;
        const questionId = typeof req.query.questionId === 'string' ? req.query.questionId : undefined;
        const status = typeof req.query.status === 'string' && Object.values(client_1.AnswerRequestStatus).includes(req.query.status)
            ? req.query.status
            : undefined;
        const where = Object.assign(Object.assign({ questionerId: userId }, (questionId ? { questionId } : {})), (status ? { status } : {}));
        const [total, rows] = yield Promise.all([
            client_2.default.answerRequest.count({ where }),
            client_2.default.answerRequest.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: incomingRequestInclude,
            }),
        ]);
        const responderIds = [...new Set(rows.map((r) => r.responder.id))];
        const responderRatings = yield Promise.all(responderIds.map((id) => (0, ratings_1.getUserRatingByRole)(id, client_1.RatingRole.AS_RESPONDER)));
        const ratingByResponderId = new Map(responderIds.map((id, index) => [id, responderRatings[index]]));
        const items = rows.map((r) => {
            const rating = ratingByResponderId.get(r.responder.id);
            return requestSummary(Object.assign(Object.assign({}, r), { counterparty: {
                    id: r.responder.id,
                    name: r.responder.name,
                    username: r.responder.username,
                    profileImageUrl: r.responder.profileImageUrl,
                    asResponder: {
                        averageRating: rating.averageRating,
                        reviewsCount: rating.reviewsCount,
                    },
                } }));
        });
        return res.status(200).json({
            message: 'Successful',
            data: { items, pagination: { page, limit, total, hasMore: skip + items.length < total } },
        });
    }
    catch (error) {
        console.error('getIncomingRequests error:', error);
        return res.status(500).json({ error: 'Failed to fetch incoming requests' });
    }
});
exports.getIncomingRequests = getIncomingRequests;
/**
 * GET /requests/outgoing?status=
 * Responder's outgoing requests.
 */
const getOutgoingRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const userId = req.user.userId;
        const status = typeof req.query.status === 'string' && Object.values(client_1.AnswerRequestStatus).includes(req.query.status)
            ? req.query.status
            : undefined;
        const where = Object.assign({ responderId: userId }, (status ? { status } : {}));
        const [total, rows] = yield Promise.all([
            client_2.default.answerRequest.count({ where }),
            client_2.default.answerRequest.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: outgoingRequestInclude,
            }),
        ]);
        const items = rows.map((r) => requestSummary(Object.assign(Object.assign({}, r), { counterparty: {
                id: r.questioner.id,
                name: r.questioner.name,
                username: r.questioner.username,
                profileImageUrl: r.questioner.profileImageUrl,
            } })));
        return res.status(200).json({
            message: 'Successful',
            data: { items, pagination: { page, limit, total, hasMore: skip + items.length < total } },
        });
    }
    catch (error) {
        console.error('getOutgoingRequests error:', error);
        return res.status(500).json({ error: 'Failed to fetch outgoing requests' });
    }
});
exports.getOutgoingRequests = getOutgoingRequests;
/**
 * GET /requests/conversations
 * Unified inbox: all request-scoped chats (pending + accepted + closed),
 * sorted by latest activity, with unread counts per thread.
 */
const getConversations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const rows = yield client_2.default.answerRequest.findMany({
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
        const unreadGroups = requestIds.length > 0
            ? yield client_2.default.message.groupBy({
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
            var _a, _b, _c, _d;
            const isQuestioner = r.questionerId === userId;
            const counterparty = isQuestioner ? r.responder : r.questioner;
            const lastMessage = (_a = r.messages[0]) !== null && _a !== void 0 ? _a : null;
            const unreadCount = (_b = unreadMap.get(r.id)) !== null && _b !== void 0 ? _b : 0;
            const sortAt = (_d = (_c = lastMessage === null || lastMessage === void 0 ? void 0 : lastMessage.createdAt) !== null && _c !== void 0 ? _c : r.respondedAt) !== null && _d !== void 0 ? _d : r.createdAt;
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
    }
    catch (error) {
        console.error('getConversations error:', error);
        return res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});
exports.getConversations = getConversations;
/**
 * GET /requests/:id
 * Returns the request context: question summary, counterparty, status, canType.
 */
const getRequestDetail = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const request = yield fetchRequestWithQuestion(id);
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        if (request.responderId !== userId && request.questionerId !== userId) {
            return res.status(403).json({ error: 'Not a participant in this request' });
        }
        const counterpartyId = userId === request.questionerId ? request.responderId : request.questionerId;
        const counterparty = yield client_2.default.user.findUnique({
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
                respondedAt: (_b = (_a = request.respondedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
                canType: request.status === client_1.AnswerRequestStatus.ACCEPTED,
                question: {
                    id: request.question.id,
                    title: request.question.title,
                    detail: request.question.detail,
                    price: request.question.price,
                    status: request.question.status,
                    latitude: request.question.latitude,
                    longitude: request.question.longitude,
                    address: request.question.address,
                    restrictToNearby: request.question.restrictToNearby,
                    category: request.question.category,
                },
                counterparty,
            },
        });
    }
    catch (error) {
        console.error('getRequestDetail error:', error);
        return res.status(500).json({ error: 'Failed to fetch request detail' });
    }
});
exports.getRequestDetail = getRequestDetail;
