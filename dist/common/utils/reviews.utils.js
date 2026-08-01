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
exports.revealReviewsForQuestion = exports.tryRevealMutualReviews = exports.revealReviewsForRequest = exports.isReviewWindowOpen = exports.getReviewWindowEndsAt = exports.getReviewUnlockAt = exports.isReviewUnlocked = exports.getReviewUnlockReason = exports.REVIEW_ACTIVITY_QUESTIONER_MIN = exports.REVIEW_ACTIVITY_RESPONDER_MIN = void 0;
const client_1 = require("@prisma/client");
const client_2 = __importDefault(require("../../core/database/prisma/client"));
const configService_1 = require("../../modules/config/configService");
const client_3 = require("@prisma/client");
const ratings_1 = require("./ratings");
exports.REVIEW_ACTIVITY_RESPONDER_MIN = 4;
exports.REVIEW_ACTIVITY_QUESTIONER_MIN = 3;
const getMessageCountsByRole = (request) => __awaiter(void 0, void 0, void 0, function* () {
    const [questionerMsgCount, responderMsgCount] = yield Promise.all([
        client_2.default.message.count({
            where: { answerRequestId: request.id, senderId: request.questionerId },
        }),
        client_2.default.message.count({
            where: { answerRequestId: request.id, senderId: request.responderId },
        }),
    ]);
    return { questionerMsgCount, responderMsgCount };
});
/**
 * Review unlock rules:
 *   - request is ACCEPTED and question was closed as answered (answeredAt set), OR
 *   - activity threshold (4 responder + 3 questioner messages) met.
 */
const getReviewUnlockReason = (request) => __awaiter(void 0, void 0, void 0, function* () {
    if (request.status !== client_1.AnswerRequestStatus.ACCEPTED) {
        return null;
    }
    if (request.question.answeredAt != null) {
        return 'marked_answered';
    }
    const { questionerMsgCount, responderMsgCount } = yield getMessageCountsByRole(request);
    if (responderMsgCount >= exports.REVIEW_ACTIVITY_RESPONDER_MIN &&
        questionerMsgCount >= exports.REVIEW_ACTIVITY_QUESTIONER_MIN) {
        return 'activity_threshold';
    }
    return null;
});
exports.getReviewUnlockReason = getReviewUnlockReason;
const isReviewUnlocked = (request) => __awaiter(void 0, void 0, void 0, function* () {
    const reason = yield (0, exports.getReviewUnlockReason)(request);
    return reason !== null;
});
exports.isReviewUnlocked = isReviewUnlocked;
const getReviewWindowMs = () => __awaiter(void 0, void 0, void 0, function* () {
    const days = yield (0, configService_1.getReviewRevealWindowDays)();
    return days * 24 * 60 * 60 * 1000;
});
const getActivityThresholdUnlockAt = (request) => __awaiter(void 0, void 0, void 0, function* () {
    const [responderMsgs, questionerMsgs] = yield Promise.all([
        client_2.default.message.findMany({
            where: { answerRequestId: request.id, senderId: request.responderId },
            orderBy: { createdAt: 'asc' },
            take: exports.REVIEW_ACTIVITY_RESPONDER_MIN,
            select: { createdAt: true },
        }),
        client_2.default.message.findMany({
            where: { answerRequestId: request.id, senderId: request.questionerId },
            orderBy: { createdAt: 'asc' },
            take: exports.REVIEW_ACTIVITY_QUESTIONER_MIN,
            select: { createdAt: true },
        }),
    ]);
    if (responderMsgs.length < exports.REVIEW_ACTIVITY_RESPONDER_MIN ||
        questionerMsgs.length < exports.REVIEW_ACTIVITY_QUESTIONER_MIN) {
        return null;
    }
    const responderThresholdAt = responderMsgs[exports.REVIEW_ACTIVITY_RESPONDER_MIN - 1].createdAt;
    const questionerThresholdAt = questionerMsgs[exports.REVIEW_ACTIVITY_QUESTIONER_MIN - 1].createdAt;
    return responderThresholdAt > questionerThresholdAt ? responderThresholdAt : questionerThresholdAt;
});
/** When reviews became available for this request (answered mark or activity threshold). */
const getReviewUnlockAt = (request) => __awaiter(void 0, void 0, void 0, function* () {
    const reason = yield (0, exports.getReviewUnlockReason)(request);
    if (!reason) {
        return null;
    }
    if (reason === 'marked_answered') {
        return request.question.answeredAt;
    }
    return getActivityThresholdUnlockAt(request);
});
exports.getReviewUnlockAt = getReviewUnlockAt;
const getReviewWindowEndsAt = (request) => __awaiter(void 0, void 0, void 0, function* () {
    const unlockAt = yield (0, exports.getReviewUnlockAt)(request);
    if (!unlockAt) {
        return null;
    }
    return new Date(unlockAt.getTime() + (yield getReviewWindowMs()));
});
exports.getReviewWindowEndsAt = getReviewWindowEndsAt;
const isReviewWindowOpen = (request) => __awaiter(void 0, void 0, void 0, function* () {
    const endsAt = yield (0, exports.getReviewWindowEndsAt)(request);
    if (!endsAt) {
        return false;
    }
    return Date.now() < endsAt.getTime();
});
exports.isReviewWindowOpen = isReviewWindowOpen;
const revealReviewsForRequest = (answerRequestId) => __awaiter(void 0, void 0, void 0, function* () {
    const now = new Date();
    const hiddenReviews = yield client_2.default.review.findMany({
        where: { answerRequestId, isRevealed: false },
    });
    if (hiddenReviews.length === 0) {
        return;
    }
    yield client_2.default.review.updateMany({
        where: { answerRequestId, isRevealed: false },
        data: { isRevealed: true, revealedAt: now },
    });
    const rateeIds = new Set(hiddenReviews.map((review) => review.rateeId));
    for (const rateeId of rateeIds) {
        const roles = hiddenReviews
            .filter((review) => review.rateeId === rateeId)
            .map((review) => review.raterRole === client_1.ReviewerRole.QUESTIONER
            ? client_3.RatingRole.AS_RESPONDER
            : client_3.RatingRole.AS_QUESTIONER);
        for (const role of new Set(roles)) {
            yield (0, ratings_1.recomputeUserRatingAggregate)(rateeId, role);
        }
    }
});
exports.revealReviewsForRequest = revealReviewsForRequest;
const tryRevealMutualReviews = (answerRequestId) => __awaiter(void 0, void 0, void 0, function* () {
    const reviews = yield client_2.default.review.findMany({ where: { answerRequestId } });
    if (reviews.length < 2) {
        return false;
    }
    const hasQuestionerReview = reviews.some((r) => r.raterRole === client_1.ReviewerRole.QUESTIONER);
    const hasResponderReview = reviews.some((r) => r.raterRole === client_1.ReviewerRole.RESPONDER);
    if (!hasQuestionerReview || !hasResponderReview) {
        return false;
    }
    yield (0, exports.revealReviewsForRequest)(answerRequestId);
    return true;
});
exports.tryRevealMutualReviews = tryRevealMutualReviews;
/** Keep the legacy alias alive for any callers that still expect the old name. */
exports.revealReviewsForQuestion = exports.revealReviewsForRequest;
