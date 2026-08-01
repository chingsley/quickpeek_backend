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
exports.QuestionStatus = exports.AnswerRequestStatus = exports.getMyReviewForRequest = exports.submitReview = exports.getReviewEligibility = void 0;
const client_1 = require("@prisma/client");
Object.defineProperty(exports, "AnswerRequestStatus", { enumerable: true, get: function () { return client_1.AnswerRequestStatus; } });
Object.defineProperty(exports, "QuestionStatus", { enumerable: true, get: function () { return client_1.QuestionStatus; } });
const client_2 = __importDefault(require("../../../core/database/prisma/client"));
const reviews_utils_1 = require("../../../common/utils/reviews.utils");
const configService_1 = require("../../config/configService");
const getRequestWithQuestion = (requestId) => __awaiter(void 0, void 0, void 0, function* () {
    return client_2.default.answerRequest.findUnique({
        where: { id: requestId },
        include: {
            question: { select: { id: true, status: true, userId: true, answeredAt: true } },
        },
    });
});
const assertReviewParticipant = (request, userId) => {
    if (!request) {
        return { ok: false, status: 404, error: 'Request not found' };
    }
    if (request.responderId !== userId && request.questionerId !== userId) {
        return { ok: false, status: 403, error: 'Not a participant in this request' };
    }
    return { ok: true };
};
/**
 * GET /requests/:id/review-eligibility
 * Eligibility to review a request: must be a participant, request must be
 * ACCEPTED, and the question must be closed as answered (or activity threshold met).
 */
const getReviewEligibility = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id: requestId } = req.params;
        const userId = req.user.userId;
        const request = yield getRequestWithQuestion(requestId);
        const guard = assertReviewParticipant(request, userId);
        if (!guard.ok) {
            return res.status(guard.status).json({ error: guard.error });
        }
        const unlockedReason = yield (0, reviews_utils_1.getReviewUnlockReason)(request);
        const unlocked = unlockedReason !== null;
        const reviewWindowEndsAt = unlocked ? yield (0, reviews_utils_1.getReviewWindowEndsAt)(request) : null;
        const reviewWindowOpen = unlocked ? yield (0, reviews_utils_1.isReviewWindowOpen)(request) : false;
        const reviewWindowDays = yield (0, configService_1.getReviewRevealWindowDays)();
        const existingReview = yield client_2.default.review.findUnique({
            where: { answerRequestId_raterId: { answerRequestId: requestId, raterId: userId } },
        });
        return res.status(200).json({
            message: 'Successful',
            data: {
                canReview: unlocked && reviewWindowOpen && !existingReview,
                alreadyReviewed: !!existingReview,
                reviewSubmitted: !!existingReview,
                reviewRevealed: (_a = existingReview === null || existingReview === void 0 ? void 0 : existingReview.isRevealed) !== null && _a !== void 0 ? _a : false,
                unlockedReason,
                unlocked,
                reviewWindowOpen,
                reviewWindowEnded: unlocked && !reviewWindowOpen,
                reviewWindowEndsAt: (_b = reviewWindowEndsAt === null || reviewWindowEndsAt === void 0 ? void 0 : reviewWindowEndsAt.toISOString()) !== null && _b !== void 0 ? _b : null,
                reviewWindowDays,
            },
        });
    }
    catch (error) {
        console.error('getReviewEligibility error:', error);
        return res.status(500).json({ error: 'Failed to check review eligibility' });
    }
});
exports.getReviewEligibility = getReviewEligibility;
/**
 * POST /requests/:id/reviews
 * Submit (or update) a review for this request. Double-blind: revealed only
 * once both parties have submitted.
 */
const submitReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id: requestId } = req.params;
        const userId = req.user.userId;
        const { stars, comment } = req.body;
        const request = yield getRequestWithQuestion(requestId);
        const guard = assertReviewParticipant(request, userId);
        if (!guard.ok) {
            return res.status(guard.status).json({ error: guard.error });
        }
        if (!(yield (0, reviews_utils_1.isReviewUnlocked)(request))) {
            return res.status(409).json({ error: 'Reviews are not unlocked for this request yet' });
        }
        if (!(yield (0, reviews_utils_1.isReviewWindowOpen)(request))) {
            return res.status(409).json({ error: 'The review window has ended' });
        }
        const isQuestioner = request.questionerId === userId;
        const raterRole = isQuestioner ? client_1.ReviewerRole.QUESTIONER : client_1.ReviewerRole.RESPONDER;
        const rateeId = isQuestioner ? request.responderId : request.questionerId;
        const review = yield client_2.default.review.upsert({
            where: { answerRequestId_raterId: { answerRequestId: requestId, raterId: userId } },
            create: {
                answerRequestId: requestId,
                raterId: userId,
                rateeId,
                raterRole,
                stars,
                comment: (comment === null || comment === void 0 ? void 0 : comment.trim()) || null,
                isRevealed: false,
            },
            update: {
                stars,
                comment: (comment === null || comment === void 0 ? void 0 : comment.trim()) || null,
            },
        });
        const revealed = yield (0, reviews_utils_1.tryRevealMutualReviews)(requestId);
        return res.status(201).json({
            message: revealed ? 'Review submitted and revealed' : 'Review submitted',
            data: {
                id: review.id,
                stars: review.stars,
                comment: review.comment,
                isRevealed: revealed || review.isRevealed,
                revealed,
            },
        });
    }
    catch (error) {
        console.error('submitReview error:', error);
        return res.status(500).json({ error: 'Failed to submit review' });
    }
});
exports.submitReview = submitReview;
/**
 * GET /requests/:id/my-review
 * Returns the caller's own review for this request (if any).
 */
const getMyReviewForRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id: requestId } = req.params;
        const userId = req.user.userId;
        const review = yield client_2.default.review.findUnique({
            where: { answerRequestId_raterId: { answerRequestId: requestId, raterId: userId } },
        });
        return res.status(200).json({
            message: 'Successful',
            data: review
                ? {
                    id: review.id,
                    stars: review.stars,
                    comment: review.comment,
                    isRevealed: review.isRevealed,
                    createdAt: review.createdAt.toISOString(),
                }
                : null,
        });
    }
    catch (error) {
        console.error('getMyReviewForRequest error:', error);
        return res.status(500).json({ error: 'Failed to fetch review' });
    }
});
exports.getMyReviewForRequest = getMyReviewForRequest;
