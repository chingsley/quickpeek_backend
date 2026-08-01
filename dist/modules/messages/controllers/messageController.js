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
exports.getRequestThread = exports.markMessagesRead = exports.sendMessage = exports.getMessages = void 0;
const client_1 = require("@prisma/client");
const client_2 = __importDefault(require("../../../core/database/prisma/client"));
const socket_server_1 = require("../../../core/socket/socket.server");
const messages_utils_1 = require("../../../common/utils/messages.utils");
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
            price: true,
            userId: true,
            status: true,
            latitude: true,
            longitude: true,
            address: true,
            category: { select: { id: true, name: true, slug: true } },
        },
    },
    transaction: { select: { status: true } },
};
const getRequest = (requestId) => __awaiter(void 0, void 0, void 0, function* () {
    return client_2.default.answerRequest.findUnique({
        where: { id: requestId },
        select: REQUEST_PARTICIPANTS_SELECT,
    });
});
const assertParticipant = (request, userId) => {
    if (!request) {
        return { ok: false, status: 404, error: 'Request not found' };
    }
    if (request.responderId !== userId && request.questionerId !== userId) {
        return { ok: false, status: 403, error: 'Not a participant in this conversation' };
    }
    return { ok: true };
};
const counterpartyIdOf = (request, userId) => userId === request.questionerId ? request.responderId : request.questionerId;
/**
 * GET /requests/:id/messages
 * Returns messages visible to the caller (null visibleToUserId = both, or matches caller).
 */
const getMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id: requestId } = req.params;
        const userId = req.user.userId;
        const request = yield getRequest(requestId);
        const guard = assertParticipant(request, userId);
        if (!guard.ok) {
            return res.status(guard.status).json({ error: guard.error });
        }
        const messages = yield client_2.default.message.findMany({
            where: {
                answerRequestId: requestId,
                OR: [{ visibleToUserId: null }, { visibleToUserId: userId }],
            },
            include: {
                replyTo: { select: { id: true, senderId: true, text: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        return res.status(200).json({
            message: 'Successful',
            data: messages.map(messages_utils_1.formatMessagePayload),
        });
    }
    catch (error) {
        console.error('getMessages error:', error);
        return res.status(500).json({ error: 'Failed to fetch messages' });
    }
});
exports.getMessages = getMessages;
/**
 * POST /requests/:id/messages
 * Allowed only when the request is ACCEPTED. Blocked for PENDING/REJECTED/CLOSED_ANSWERED.
 */
const sendMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id: requestId } = req.params;
        const userId = req.user.userId;
        const { text, replyToId } = req.body;
        const request = yield getRequest(requestId);
        const guard = assertParticipant(request, userId);
        if (!guard.ok) {
            return res.status(guard.status).json({ error: guard.error });
        }
        if (request.status !== client_1.AnswerRequestStatus.ACCEPTED) {
            return res.status(409).json({
                error: `Conversation is locked while request is ${request.status}`,
            });
        }
        // A reply target must be a USER message in the same conversation — those
        // are always visible to both participants, so the quote never leaks a
        // system message the other side can't see.
        let replyTo = null;
        if (replyToId) {
            replyTo = yield client_2.default.message.findFirst({
                where: {
                    id: replyToId,
                    answerRequestId: requestId,
                    type: client_1.MessageType.USER,
                },
                select: { id: true, senderId: true, text: true },
            });
            if (!replyTo) {
                return res.status(400).json({ error: 'Invalid replyToId' });
            }
        }
        const message = yield client_2.default.message.create({
            data: {
                questionId: request.questionId,
                answerRequestId: requestId,
                senderId: userId,
                text: text.trim(),
                replyToId: (_a = replyTo === null || replyTo === void 0 ? void 0 : replyTo.id) !== null && _a !== void 0 ? _a : null,
            },
        });
        const payload = (0, messages_utils_1.formatMessagePayload)(Object.assign(Object.assign({}, message), { replyTo }));
        const recipientId = counterpartyIdOf(request, userId);
        (0, socket_server_1.emitToUser)(recipientId, 'message:new', payload);
        return res.status(201).json({ message: 'Message sent', data: payload });
    }
    catch (error) {
        console.error('sendMessage error:', error);
        return res.status(500).json({ error: 'Failed to send message' });
    }
});
exports.sendMessage = sendMessage;
/**
 * POST /requests/:id/messages/read
 * Marks the caller's unread, non-system, non-self messages as read.
 */
const markMessagesRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id: requestId } = req.params;
        const userId = req.user.userId;
        const request = yield getRequest(requestId);
        const guard = assertParticipant(request, userId);
        if (!guard.ok) {
            return res.status(guard.status).json({ error: guard.error });
        }
        yield client_2.default.message.updateMany({
            where: {
                answerRequestId: requestId,
                senderId: { not: userId },
                readAt: null,
                OR: [{ visibleToUserId: null }, { visibleToUserId: userId }],
            },
            data: { readAt: new Date() },
        });
        return res.status(200).json({ message: 'Messages marked as read' });
    }
    catch (error) {
        console.error('markMessagesRead error:', error);
        return res.status(500).json({ error: 'Failed to mark messages as read' });
    }
});
exports.markMessagesRead = markMessagesRead;
/**
 * GET /requests/:id/thread
 * Chat context: question summary + counterparty + status + canType flag.
 */
const getRequestThread = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id: requestId } = req.params;
        const userId = req.user.userId;
        const request = yield getRequest(requestId);
        const guard = assertParticipant(request, userId);
        if (!guard.ok) {
            return res.status(guard.status).json({ error: guard.error });
        }
        const counterpartyId = counterpartyIdOf(request, userId);
        const [counterparty, payoutAccount] = yield Promise.all([
            client_2.default.user.findUnique({
                where: { id: counterpartyId },
                select: {
                    id: true,
                    name: true,
                    username: true,
                    profileImageUrl: true,
                },
            }),
            // The responder's payout currency is what a payment would be charged in.
            client_2.default.paymentAccount.findUnique({
                where: { userId: request.responderId },
                select: { currency: true },
            }),
        ]);
        const q = request.question;
        return res.status(200).json({
            message: 'Successful',
            data: {
                id: request.id,
                status: request.status,
                canType: request.status === client_1.AnswerRequestStatus.ACCEPTED,
                questionerId: request.questionerId,
                responderId: request.responderId,
                question: {
                    id: q.id,
                    title: q.title,
                    detail: q.detail,
                    price: q.price,
                    status: q.status,
                    latitude: q.latitude,
                    longitude: q.longitude,
                    address: q.address,
                    category: q.category,
                },
                payment: request.transaction ? { status: request.transaction.status } : null,
                payoutCurrency: (_a = payoutAccount === null || payoutAccount === void 0 ? void 0 : payoutAccount.currency) !== null && _a !== void 0 ? _a : null,
                counterparty,
            },
        });
    }
    catch (error) {
        console.error('getRequestThread error:', error);
        return res.status(500).json({ error: 'Failed to fetch request thread' });
    }
});
exports.getRequestThread = getRequestThread;
