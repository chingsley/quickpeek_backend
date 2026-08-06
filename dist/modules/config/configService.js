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
exports.MARKET_CONFIG_KEYS = void 0;
exports.getMarketConfigValue = getMarketConfigValue;
exports.getReviewRevealWindowDays = getReviewRevealWindowDays;
exports.getPlatformFeePercent = getPlatformFeePercent;
exports.setMarketConfigValue = setMarketConfigValue;
const client_1 = __importDefault(require("../../core/database/prisma/client"));
/**
 * Market-wide runtime config keys. Stored as floats in the `market_configs`
 * table so values can be tuned per deployment without a code change.
 */
exports.MARKET_CONFIG_KEYS = {
    nearMeRadiusKm: 'nearMeRadiusKm',
    reviewRevealWindowDays: 'reviewRevealWindowDays',
    platformFeePercent: 'platformFeePercent',
    radiusExactSpotKm: 'radiusExactSpotKm',
    radiusWalkingKm: 'radiusWalkingKm',
    radiusNeighbourhoodKm: 'radiusNeighbourhoodKm',
    radiusCityKm: 'radiusCityKm',
};
const DEFAULTS = {
    [exports.MARKET_CONFIG_KEYS.nearMeRadiusKm]: 5,
    [exports.MARKET_CONFIG_KEYS.reviewRevealWindowDays]: 14,
    [exports.MARKET_CONFIG_KEYS.platformFeePercent]: 0,
    [exports.MARKET_CONFIG_KEYS.radiusExactSpotKm]: 0.3,
    [exports.MARKET_CONFIG_KEYS.radiusWalkingKm]: 1,
    [exports.MARKET_CONFIG_KEYS.radiusNeighbourhoodKm]: 5,
    [exports.MARKET_CONFIG_KEYS.radiusCityKm]: 25,
};
const CACHE_TTL_MS = 60000;
const cache = new Map();
let cacheExpiresAt = 0;
const refreshMarketConfigCache = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const rows = yield client_1.default.marketConfig.findMany();
        cache.clear();
        for (const row of rows) {
            cache.set(row.key, row.value);
        }
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    }
    catch (err) {
        console.error('refreshMarketConfigCache failed', err);
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    }
});
/**
 * Read a market config value. Falls back to the default if the row is missing
 * or the DB read fails — never throws so feed/question-detail paths stay
 * resilient. All rows are loaded together and cached for `CACHE_TTL_MS`.
 */
function getMarketConfigValue(key) {
    return __awaiter(this, void 0, void 0, function* () {
        if (cacheExpiresAt <= Date.now()) {
            yield refreshMarketConfigCache();
        }
        const cached = cache.get(key);
        if (cached != null && !Number.isNaN(cached)) {
            return cached;
        }
        const fallback = DEFAULTS[key];
        if (fallback == null || Number.isNaN(fallback)) {
            console.error(`getMarketConfigValue(${key}) missing default`);
            return 0;
        }
        return fallback;
    });
}
/** Days after review unlock before the submission/reveal window closes. */
function getReviewRevealWindowDays() {
    return __awaiter(this, void 0, void 0, function* () {
        return getMarketConfigValue(exports.MARKET_CONFIG_KEYS.reviewRevealWindowDays);
    });
}
/** Platform commission on question payments, in percent (0–100). */
function getPlatformFeePercent() {
    return __awaiter(this, void 0, void 0, function* () {
        return getMarketConfigValue(exports.MARKET_CONFIG_KEYS.platformFeePercent);
    });
}
/**
 * Update a config value. Invalidates the cache so the next read reloads all rows.
 */
function setMarketConfigValue(key, value) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client_1.default.marketConfig.upsert({
            where: { key },
            update: { value },
            create: { key, value },
        });
        cache.clear();
        cacheExpiresAt = 0;
    });
}
