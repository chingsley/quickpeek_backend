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
exports.getQuestionFeedAttention = exports.loadQuestionFeedAttentionMap = exports.loadViewerRequestMap = exports.buildAwaitingApprovalFeedQuestions = exports.loadAwaitingApprovalFeedItems = exports.buildViewerRequestSummary = exports.getUnreadCountForRequest = exports.hasResponderSentUserMessage = exports.getActiveBlock = void 0;
const client_1 = require("@prisma/client");
const client_2 = __importDefault(require("../../core/database/prisma/client"));
const getActiveBlock = (questionId, responderId) => client_2.default.questionResponderBlock.findFirst({
    where: { questionId, responderId, removedAt: null },
});
exports.getActiveBlock = getActiveBlock;
const hasResponderSentUserMessage = (answerRequestId, responderId) => __awaiter(void 0, void 0, void 0, function* () {
    const count = yield client_2.default.message.count({
        where: {
            answerRequestId,
            senderId: responderId,
            type: client_1.MessageType.USER,
        },
    });
    return count > 0;
});
exports.hasResponderSentUserMessage = hasResponderSentUserMessage;
const getUnreadCountForRequest = (answerRequestId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    return client_2.default.message.count({
        where: {
            answerRequestId,
            senderId: { not: userId },
            readAt: null,
            OR: [{ visibleToUserId: null }, { visibleToUserId: userId }],
        },
    });
});
exports.getUnreadCountForRequest = getUnreadCountForRequest;
const buildViewerRequestSummary = (request, viewerId, isBlocked) => __awaiter(void 0, void 0, void 0, function* () {
    const hasResponded = request.status === client_1.AnswerRequestStatus.ACCEPTED
        ? yield (0, exports.hasResponderSentUserMessage)(request.id, request.responderId)
        : false;
    const unreadCount = yield (0, exports.getUnreadCountForRequest)(request.id, viewerId);
    return {
        id: request.id,
        status: request.status,
        rejectionReason: request.rejectionReason,
        hasResponded,
        unreadCount,
        isBlocked,
    };
});
exports.buildViewerRequestSummary = buildViewerRequestSummary;
/** Pending incoming requests on the viewer's own OPEN questions. */
const loadAwaitingApprovalFeedItems = (viewerId) => __awaiter(void 0, void 0, void 0, function* () {
    const requests = yield client_2.default.answerRequest.findMany({
        where: {
            questionerId: viewerId,
            status: client_1.AnswerRequestStatus.PENDING,
            question: { status: client_1.QuestionStatus.OPEN },
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
    const unreadGroups = requestIds.length > 0
        ? yield client_2.default.message.groupBy({
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
    return requests.map((r) => {
        var _a;
        return ({
            request: r,
            unreadCount: (_a = unreadMap.get(r.id)) !== null && _a !== void 0 ? _a : 0,
        });
    });
});
exports.loadAwaitingApprovalFeedItems = loadAwaitingApprovalFeedItems;
/** One feed row per question with pending incoming requests (grouped). */
const buildAwaitingApprovalFeedQuestions = (viewerId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const items = yield (0, exports.loadAwaitingApprovalFeedItems)(viewerId);
    const byQuestion = new Map();
    for (const entry of items) {
        const questionId = entry.request.questionId;
        const group = (_a = byQuestion.get(questionId)) !== null && _a !== void 0 ? _a : [];
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
});
exports.buildAwaitingApprovalFeedQuestions = buildAwaitingApprovalFeedQuestions;
const loadViewerRequestMap = (viewerId, questionIds) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    if (questionIds.length === 0) {
        return {
            requestMap: new Map(),
            blockMap: new Map(),
        };
    }
    const [requests, blocks] = yield Promise.all([
        client_2.default.answerRequest.findMany({
            where: { responderId: viewerId, questionId: { in: questionIds } },
            select: {
                id: true,
                questionId: true,
                status: true,
                rejectionReason: true,
                responderId: true,
            },
        }),
        client_2.default.questionResponderBlock.findMany({
            where: { responderId: viewerId, questionId: { in: questionIds }, removedAt: null },
            select: { questionId: true, rejectionReason: true },
        }),
    ]);
    const acceptedIds = requests
        .filter((r) => r.status === client_1.AnswerRequestStatus.ACCEPTED)
        .map((r) => r.id);
    const respondedSet = new Set();
    if (acceptedIds.length > 0) {
        const responded = yield client_2.default.message.groupBy({
            by: ['answerRequestId'],
            where: {
                answerRequestId: { in: acceptedIds },
                type: client_1.MessageType.USER,
                senderId: viewerId,
            },
            _count: { id: true },
        });
        responded.forEach((g) => respondedSet.add(g.answerRequestId));
    }
    const requestIds = requests.map((r) => r.id);
    const unreadGroups = requestIds.length > 0
        ? yield client_2.default.message.groupBy({
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
    const blockMap = new Map(blocks.map((b) => [b.questionId, { rejectionReason: b.rejectionReason }]));
    const requestMap = new Map();
    for (const r of requests) {
        const isBlocked = blockMap.has(r.questionId);
        requestMap.set(r.questionId, {
            id: r.id,
            status: r.status,
            rejectionReason: (_c = (_a = r.rejectionReason) !== null && _a !== void 0 ? _a : (_b = blockMap.get(r.questionId)) === null || _b === void 0 ? void 0 : _b.rejectionReason) !== null && _c !== void 0 ? _c : null,
            hasResponded: respondedSet.has(r.id),
            unreadCount: (_d = unreadMap.get(r.id)) !== null && _d !== void 0 ? _d : 0,
            isBlocked,
        });
    }
    for (const [questionId, block] of blockMap) {
        if (!requestMap.has(questionId)) {
            requestMap.set(questionId, {
                id: '',
                status: client_1.AnswerRequestStatus.REJECTED,
                rejectionReason: block.rejectionReason,
                hasResponded: false,
                unreadCount: 0,
                isBlocked: true,
            });
        }
    }
    return { requestMap, blockMap };
});
exports.loadViewerRequestMap = loadViewerRequestMap;
const EMPTY_QUESTION_FEED_ATTENTION = {
    hasAttention: false,
    unreadMessageCount: 0,
    earliestUnreadAt: null,
    pendingIncomingCount: 0,
    acceptedChatCount: 0,
    primaryChatRequestId: null,
};
const loadEarliestUnreadAtByQuestion = (viewerId, questionIds) => __awaiter(void 0, void 0, void 0, function* () {
    if (questionIds.length === 0) {
        return new Map();
    }
    const messages = yield client_2.default.message.findMany({
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
    const earliestByQuestion = new Map();
    for (const message of messages) {
        if (!earliestByQuestion.has(message.questionId)) {
            earliestByQuestion.set(message.questionId, message.createdAt);
        }
    }
    return earliestByQuestion;
});
/** Per-question attention state for the Home feed (unread chats + pending approvals). */
const loadQuestionFeedAttentionMap = (viewerId, questions) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const result = new Map();
    if (questions.length === 0) {
        return result;
    }
    const questionIds = questions.map((q) => q.id);
    const ownerByQuestion = new Map(questions.map((q) => [q.id, q.userId]));
    const allRequests = yield client_2.default.answerRequest.findMany({
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
    const [unreadMap, earliestUnreadByQuestion] = yield Promise.all([
        (() => __awaiter(void 0, void 0, void 0, function* () {
            const map = new Map();
            if (requestIds.length === 0) {
                return map;
            }
            const unreadGroups = yield client_2.default.message.groupBy({
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
        }))(),
        loadEarliestUnreadAtByQuestion(viewerId, questionIds),
    ]);
    for (const questionId of questionIds) {
        const isOwner = ownerByQuestion.get(questionId) === viewerId;
        const reqs = allRequests.filter((r) => r.questionId === questionId);
        if (isOwner) {
            const ownerReqs = reqs.filter((r) => r.questionerId === viewerId);
            const pendingIncomingCount = ownerReqs.filter((r) => r.status === client_1.AnswerRequestStatus.PENDING).length;
            const accepted = ownerReqs.filter((r) => r.status === client_1.AnswerRequestStatus.ACCEPTED);
            const unreadMessageCount = ownerReqs.reduce((sum, r) => { var _a; return sum + ((_a = unreadMap.get(r.id)) !== null && _a !== void 0 ? _a : 0); }, 0);
            const earliestUnreadAt = earliestUnreadByQuestion.get(questionId);
            result.set(questionId, {
                pendingIncomingCount,
                acceptedChatCount: accepted.length,
                unreadMessageCount,
                earliestUnreadAt: (_a = earliestUnreadAt === null || earliestUnreadAt === void 0 ? void 0 : earliestUnreadAt.toISOString()) !== null && _a !== void 0 ? _a : null,
                primaryChatRequestId: accepted.length === 1 ? accepted[0].id : null,
                hasAttention: unreadMessageCount > 0 || pendingIncomingCount > 0,
            });
        }
        else {
            const viewerReq = reqs.find((r) => r.responderId === viewerId);
            const unreadMessageCount = viewerReq ? ((_b = unreadMap.get(viewerReq.id)) !== null && _b !== void 0 ? _b : 0) : 0;
            const earliestUnreadAt = earliestUnreadByQuestion.get(questionId);
            result.set(questionId, {
                pendingIncomingCount: 0,
                acceptedChatCount: (viewerReq === null || viewerReq === void 0 ? void 0 : viewerReq.status) === client_1.AnswerRequestStatus.ACCEPTED ? 1 : 0,
                unreadMessageCount,
                earliestUnreadAt: (_c = earliestUnreadAt === null || earliestUnreadAt === void 0 ? void 0 : earliestUnreadAt.toISOString()) !== null && _c !== void 0 ? _c : null,
                primaryChatRequestId: (_d = viewerReq === null || viewerReq === void 0 ? void 0 : viewerReq.id) !== null && _d !== void 0 ? _d : null,
                hasAttention: unreadMessageCount > 0,
            });
        }
    }
    return result;
});
exports.loadQuestionFeedAttentionMap = loadQuestionFeedAttentionMap;
const getQuestionFeedAttention = (map, questionId) => { var _a; return (_a = map.get(questionId)) !== null && _a !== void 0 ? _a : EMPTY_QUESTION_FEED_ATTENTION; };
exports.getQuestionFeedAttention = getQuestionFeedAttention;
