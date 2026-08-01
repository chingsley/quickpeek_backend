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
exports.nearbyCacheKey = nearbyCacheKey;
exports.getCachedNearbyQuestions = getCachedNearbyQuestions;
exports.setCachedNearbyQuestions = setCachedNearbyQuestions;
exports.invalidateNearbyQuestionsCache = invalidateNearbyQuestionsCache;
const redis_1 = __importDefault(require("../../core/config/redis"));
const NEARBY_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
// Quantize coords to ~100m buckets so nearby cache keys are reusable.
const COORD_PRECISION = 3;
function nearbyCacheKey(lat, lon, radiusInKm) {
    const qLat = Number(lat.toFixed(COORD_PRECISION));
    const qLon = Number(lon.toFixed(COORD_PRECISION));
    return `nearbyQuestions:${qLat}:${qLon}:${radiusInKm}`;
}
function getCachedNearbyQuestions(key) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const cached = yield redis_1.default.get(key);
            if (!cached)
                return null;
            return JSON.parse(cached);
        }
        catch (err) {
            console.error('getCachedNearbyQuestions: cache read failed', err);
            return null;
        }
    });
}
function setCachedNearbyQuestions(key, data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield redis_1.default.set(key, JSON.stringify(data), 'EX', NEARBY_CACHE_TTL_SECONDS);
        }
        catch (err) {
            // Cache write failures are non-fatal.
            console.error('setCachedNearbyQuestions: cache write failed', err);
        }
    });
}
/**
 * Invalidate nearby-question caches. Called when a new question is created
 * (the new draft would surface in nearby lists) or when assignment/answer
 * state changes. We use a scan over the prefix rather than tracking every
 * key because the keyspace is bounded by coord buckets and TTL.
 */
function invalidateNearbyQuestionsCache() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let cursor = '0';
            do {
                const [next, keys] = yield redis_1.default.scan(cursor, 'MATCH', 'nearbyQuestions:*', 'COUNT', 200);
                cursor = next;
                if (keys.length > 0) {
                    yield redis_1.default.del(...keys);
                }
            } while (cursor !== '0');
        }
        catch (err) {
            console.error('invalidateNearbyQuestionsCache failed', err);
        }
    });
}
