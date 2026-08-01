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
const client_1 = __importDefault(require("../database/prisma/client"));
const firebase_push_1 = require("../messaging/firebase.push");
const socket_server_1 = require("../socket/socket.server");
/**
 * Targeted notification to the single responder the questioner selected.
 *
 * Emits `question:new` to exactly one `user:<responderId>` room, and sends
 * one FCM push if the responder has notifications enabled. If the responder
 * has notifications disabled we still emit the socket event so an online
 * responder sees the question in real time.
 */
const notifyAssignedResponder = (job) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { questionId, assignedResponderId } = job.data;
        const question = yield client_1.default.question.findUnique({
            where: { id: questionId },
            include: {
                assignedResponder: {
                    select: { id: true, username: true, deviceToken: true, notificationsEnabled: true },
                },
                user: { select: { id: true, username: true } },
            },
        });
        if (!question) {
            throw new Error(`Question ${questionId} not found`);
        }
        if (!question.assignedResponder || question.assignedResponder.id !== assignedResponderId) {
            // The assignment changed between enqueue and processing — do nothing.
            console.warn(`notifyAssignedResponder: responder mismatch for question ${questionId}; skipping`);
            return;
        }
        const responder = question.assignedResponder;
        // 1. Targeted socket emit to the single responder.
        (0, socket_server_1.emitToUser)(responder.id, 'question:new', {
            id: question.id,
            address: question.address,
            longitude: question.longitude,
            latitude: question.latitude,
            text: question.text,
            userId: question.userId,
            questionerUsername: question.user.username,
            status: question.status,
            createdAt: question.createdAt,
            updatedAt: question.updatedAt,
            assignedResponderId: responder.id,
            assignedAt: question.assignedAt,
            timeToRespondMs: question.timeToRespondMs,
        });
        // 2. FCM push (best effort, only if enabled).
        if (!responder.notificationsEnabled) {
            console.log(`Responder ${responder.id} has notifications disabled; skipping push`);
            return;
        }
        const payload = {
            body: `${question.user.username} asked you a question: "${question.text}"`,
            data: {
                questionId: question.id,
                assignedResponderId: responder.id,
                timeToRespondMs: String((_a = question.timeToRespondMs) !== null && _a !== void 0 ? _a : ''),
            },
        };
        if (responder.deviceToken) {
            try {
                yield (0, firebase_push_1.sendNotification)(responder.deviceToken, payload);
            }
            catch (err) {
                // Push failures are not fatal — the socket delivery already happened.
                console.error(`notifyAssignedResponder: push failed for ${responder.id}`, err);
            }
        }
        console.log(`Notified assigned responder ${responder.id} for question ${question.id}`);
    }
    catch (error) {
        console.error('notifyAssignedResponder failed', error);
    }
});
exports.default = notifyAssignedResponder;
