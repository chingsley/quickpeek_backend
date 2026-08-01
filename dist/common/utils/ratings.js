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
exports.DEFAULT_RATING = void 0;
exports.computeAverage = computeAverage;
exports.getUserRatingByRole = getUserRatingByRole;
exports.getUserRating = getUserRating;
exports.recomputeUserRatingAggregate = recomputeUserRatingAggregate;
exports.invalidateUserRatingCache = invalidateUserRatingCache;
const client_1 = require("@prisma/client");
const client_2 = __importDefault(require("../../core/database/prisma/client"));
const redis_1 = __importDefault(require("../../core/config/redis"));
exports.DEFAULT_RATING = 0;
const CACHE_TTL_SECONDS = 60 * 60;
const cacheKey = (userId, role) => `userRating:${userId}:${role}`;
function computeAverage(totalStars, reviewsCount) {
    if (!reviewsCount || reviewsCount <= 0)
        return exports.DEFAULT_RATING;
    return totalStars / reviewsCount;
}
function getUserRatingByRole(userId, role) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const key = cacheKey(userId, role);
        try {
            const cached = yield redis_1.default.get(key);
            if (cached) {
                const parsed = JSON.parse(cached);
                return {
                    totalStars: parsed.totalStars,
                    reviewsCount: parsed.reviewsCount,
                    averageRating: computeAverage(parsed.totalStars, parsed.reviewsCount),
                    source: 'cache',
                };
            }
        }
        catch (err) {
            console.error(`getUserRatingByRole: cache read failed for ${userId}`, err);
        }
        const row = yield client_2.default.userRating.findUnique({
            where: { userId_role: { userId, role } },
        });
        const totalStars = (_a = row === null || row === void 0 ? void 0 : row.totalStars) !== null && _a !== void 0 ? _a : 0;
        const reviewsCount = (_b = row === null || row === void 0 ? void 0 : row.reviewsCount) !== null && _b !== void 0 ? _b : 0;
        try {
            yield redis_1.default.set(key, JSON.stringify({ totalStars, reviewsCount }), 'EX', CACHE_TTL_SECONDS);
        }
        catch (err) {
            console.error(`getUserRatingByRole: cache write failed for ${userId}`, err);
        }
        return {
            totalStars,
            reviewsCount,
            averageRating: computeAverage(totalStars, reviewsCount),
            source: 'db',
        };
    });
}
/** Responder-facing average (legacy helper name). */
function getUserRating(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const summary = yield getUserRatingByRole(userId, client_1.RatingRole.AS_RESPONDER);
        return Object.assign(Object.assign({}, summary), { totalRating: summary.totalStars, answersCount: summary.reviewsCount });
    });
}
function recomputeUserRatingAggregate(userId, role) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        // The ratee's role determines who the rater was. A user rated AS_RESPONDER
        // was rated BY a QUESTIONER, and vice-versa.
        const raterRole = role === client_1.RatingRole.AS_RESPONDER ? client_1.ReviewerRole.QUESTIONER : client_1.ReviewerRole.RESPONDER;
        const aggregate = yield client_2.default.review.aggregate({
            where: {
                rateeId: userId,
                isRevealed: true,
                raterRole,
            },
            _sum: { stars: true },
            _count: { id: true },
        });
        const totalStars = (_a = aggregate._sum.stars) !== null && _a !== void 0 ? _a : 0;
        const reviewsCount = (_b = aggregate._count.id) !== null && _b !== void 0 ? _b : 0;
        yield client_2.default.userRating.upsert({
            where: { userId_role: { userId, role } },
            create: { userId, role, totalStars, reviewsCount },
            update: { totalStars, reviewsCount },
        });
        try {
            yield redis_1.default.set(cacheKey(userId, role), JSON.stringify({ totalStars, reviewsCount }), 'EX', CACHE_TTL_SECONDS);
        }
        catch (err) {
            console.error(`recomputeUserRatingAggregate cache write failed for ${userId}`, err);
        }
    });
}
function invalidateUserRatingCache(userId, role) {
    return __awaiter(this, void 0, void 0, function* () {
        const roles = role ? [role] : [client_1.RatingRole.AS_RESPONDER, client_1.RatingRole.AS_QUESTIONER];
        try {
            yield Promise.all(roles.map((r) => redis_1.default.del(cacheKey(userId, r))));
        }
        catch (err) {
            console.error(`invalidateUserRatingCache failed for ${userId}`, err);
        }
    });
}
