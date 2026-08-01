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
exports.createQuestionBriefingMessages = exports.buildQuestionBriefingTexts = exports.createUserMessage = exports.createSystemMessage = exports.formatMessagePayload = void 0;
const client_1 = require("@prisma/client");
const client_2 = __importDefault(require("../../core/database/prisma/client"));
const socket_server_1 = require("../../core/socket/socket.server");
const formatMessagePayload = (message) => {
    var _a, _b;
    return ({
        id: message.id,
        questionId: message.questionId,
        answerRequestId: message.answerRequestId,
        senderId: message.senderId,
        text: message.text,
        type: message.type,
        visibleToUserId: message.visibleToUserId,
        createdAt: message.createdAt.toISOString(),
        readAt: (_b = (_a = message.readAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
        replyTo: message.replyTo
            ? {
                id: message.replyTo.id,
                senderId: message.replyTo.senderId,
                text: message.replyTo.text,
            }
            : null,
    });
};
exports.formatMessagePayload = formatMessagePayload;
/**
 * Creates a SYSTEM message in a request-scoped chat. When `visibleToUserId`
 * is provided, only that user sees the message; otherwise both participants do.
 *
 * Emits `message:new` to the appropriate recipients.
 */
const createSystemMessage = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const message = yield client_2.default.message.create({
        data: {
            questionId: opts.questionId,
            answerRequestId: opts.answerRequestId,
            senderId: opts.senderId,
            text: opts.text,
            type: client_1.MessageType.SYSTEM,
            visibleToUserId: (_a = opts.visibleToUserId) !== null && _a !== void 0 ? _a : null,
        },
    });
    const payload = (0, exports.formatMessagePayload)(message);
    const recipients = (_b = opts.recipientIds) !== null && _b !== void 0 ? _b : (opts.visibleToUserId ? [opts.visibleToUserId] : []);
    for (const recipientId of recipients) {
        (0, socket_server_1.emitToUser)(recipientId, 'message:new', payload);
    }
    return message;
});
exports.createSystemMessage = createSystemMessage;
/**
 * Creates a USER message visible to both participants. Emits `message:new`
 * to all recipients (typically questioner + responder).
 */
const createUserMessage = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    const message = yield client_2.default.message.create({
        data: {
            questionId: opts.questionId,
            answerRequestId: opts.answerRequestId,
            senderId: opts.senderId,
            text: opts.text,
            type: client_1.MessageType.USER,
            visibleToUserId: null,
        },
    });
    const payload = (0, exports.formatMessagePayload)(message);
    for (const recipientId of opts.recipientIds) {
        (0, socket_server_1.emitToUser)(recipientId, 'message:new', payload);
    }
    return message;
});
exports.createUserMessage = createUserMessage;
/**
 * Builds the ordered question-info texts (location, detail, acceptance criteria)
 * posted on behalf of the questioner as the opening messages of a request chat.
 */
const buildQuestionBriefingTexts = (question) => {
    var _a, _b, _c;
    const texts = [];
    const address = (_a = question.address) === null || _a === void 0 ? void 0 : _a.trim();
    if (address) {
        texts.push(`Location: ${address}`);
    }
    else if (question.latitude != null && question.longitude != null) {
        texts.push(`Location: ${question.latitude}, ${question.longitude}`);
    }
    const detail = (_b = question.detail) === null || _b === void 0 ? void 0 : _b.trim();
    if (detail) {
        texts.push(detail);
    }
    const criteria = (_c = question.acceptanceCriteria) === null || _c === void 0 ? void 0 : _c.trim();
    if (criteria) {
        texts.push(`Acceptance criteria: ${criteria}`);
    }
    return texts;
};
exports.buildQuestionBriefingTexts = buildQuestionBriefingTexts;
/**
 * Posts the question info (location, detail, acceptance criteria) as USER
 * messages from the questioner. Sent when a request to respond is created, so
 * both participants see the question context as the first messages in the chat.
 */
const createQuestionBriefingMessages = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    const texts = (0, exports.buildQuestionBriefingTexts)(opts.question);
    const recipientIds = [opts.questionerId, opts.responderId];
    const messages = [];
    for (const text of texts) {
        const message = yield (0, exports.createUserMessage)({
            questionId: opts.questionId,
            answerRequestId: opts.answerRequestId,
            senderId: opts.questionerId,
            text,
            recipientIds,
        });
        messages.push(message);
    }
    return messages;
});
exports.createQuestionBriefingMessages = createQuestionBriefingMessages;
