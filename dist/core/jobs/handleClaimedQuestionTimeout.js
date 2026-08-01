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
const socket_server_1 = require("../socket/socket.server");
const redis_1 = __importDefault(require("../config/redis"));
/**
 * Responder-Selection Flow: TTR (time-to-respond) timeout handler.
 *
 * If a question is still ASSIGNED to the same responder when the TTR window
 * elapses, we:
 *   1. Flip the status to EXPIRED (no longer actionable by the responder).
 *   2. Release the responder's TTR Redis lock.
 *   3. Emit `question:expired` to the questioner's `user:<id>` room so they
 *      can re-choose a responder (the questioner-side alert is handled by
 *      the frontend Task N9).
 *
 * Legacy `claimedByUserId` questions (PENDING_ANSWER) are handled the same way
 * for back-compat — they too move to EXPIRED rather than back to OPEN, since
 * the new model no longer exposes OPEN questions for race-to-claim.
 */
const handleClaimedQuestionTimeout = (job) => __awaiter(void 0, void 0, void 0, function* () {
    const { questionId, assignedResponderId, claimedByUserId } = job.data;
    const question = yield client_1.default.question.findUnique({ where: { id: questionId } });
    if (!question)
        return;
    const isStillAssignedToSameResponder = (question.status === 'ASSIGNED') &&
        assignedResponderId &&
        question.assignedResponderId === assignedResponderId;
    const isLegacyPendingForSameClaimer = (question.status === 'PENDING_ANSWER') &&
        claimedByUserId &&
        question.claimedByUserId === claimedByUserId;
    // Already answered / cancelled / reassigned in the meantime — do nothing.
    if (!isStillAssignedToSameResponder && !isLegacyPendingForSameClaimer) {
        return;
    }
    // 1. Flip status to EXPIRED + record expiry time.
    yield client_1.default.question.update({
        where: { id: questionId },
        data: {
            status: 'EXPIRED',
            expiredAt: new Date(),
            // Clear the responder/claimer fields so the question is unassigned.
            assignedResponderId: null,
            assignedAt: null,
            claimedByUserId: null,
            claimedAt: null,
        },
    });
    // 2. Release the TTR Redis lock.
    yield redis_1.default.del(`lock:question:${questionId}`);
    // 3. Notify the questioner that the responder didn't respond in time, with
    //    enough context for the UI to offer a "Re-choose responder" action.
    (0, socket_server_1.emitToUser)(question.userId, 'question:expired', {
        questionId,
        status: 'EXPIRED',
        expiredAt: new Date().toISOString(),
        // Include the original question context so the frontend can pre-fill the
        // Browse Responders screen without an extra fetch.
        text: question.text,
        address: question.address,
        latitude: question.latitude,
        longitude: question.longitude,
    });
    console.log(`Question ${questionId} TTR expired; questioner ${question.userId} notified.`);
});
exports.default = handleClaimedQuestionTimeout;
