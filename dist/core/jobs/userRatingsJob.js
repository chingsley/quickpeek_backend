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
const redis_1 = __importDefault(require("../config/redis"));
const processUserRating = (job) => __awaiter(void 0, void 0, void 0, function* () {
    // console.log('\n....... execution job.....\n', job.data);
    try {
        const { userId, rating } = job.data;
        yield client_1.default.$executeRaw `BEGIN TRANSACTION`;
        let totalRating = rating;
        let answersCount = 1;
        const currentRating = yield client_1.default.userRating.findUnique({ where: { userId } });
        if (currentRating) {
            totalRating = currentRating.totalRating + rating;
            answersCount = currentRating.answersCount + 1;
            yield client_1.default.userRating.update({
                where: { userId },
                data: { totalRating, answersCount }
            });
        }
        else {
            // create first rating for user: totalRatings = ratings, answersCount = 1
            yield client_1.default.userRating.create({
                data: { userId, totalRating, answersCount }
            });
        }
        yield client_1.default.$executeRaw `COMMIT TRANSACTION`;
        // Update the cache
        const cacheKey = `userRating:${userId}`;
        yield redis_1.default.set(cacheKey, JSON.stringify({ totalRating, answersCount }), 'EX', 60 * 60);
        console.log(`Updated rating for user ${userId}`);
    }
    catch (error) {
        yield client_1.default.$executeRaw `ROLLBACK TRANSACTION`;
        console.error('Failed to update user rating', error);
    }
});
exports.default = processUserRating;
