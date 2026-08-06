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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWithinScope = exports.getScopeRadiusKm = exports.SCOPE_CONFIG_KEY = void 0;
const configService_1 = require("../../modules/config/configService");
const geo_utils_1 = require("./geo.utils");
/**
 * The radius for each scope tier lives in market_configs so it can be
 * retuned without a deploy. ANYWHERE has no radius — no distance gating.
 */
exports.SCOPE_CONFIG_KEY = {
    EXACT_SPOT: 'radiusExactSpotKm',
    WALKING: 'radiusWalkingKm',
    NEIGHBOURHOOD: 'radiusNeighbourhoodKm',
    CITY: 'radiusCityKm',
    ANYWHERE: null,
};
const getScopeRadiusKm = (scope) => __awaiter(void 0, void 0, void 0, function* () {
    const key = exports.SCOPE_CONFIG_KEY[scope];
    if (!key)
        return null;
    return (0, configService_1.getMarketConfigValue)(key);
});
exports.getScopeRadiusKm = getScopeRadiusKm;
/**
 * The single place distance gating is decided. A scoped question without
 * coordinates cannot be anchored — creation validation prevents that state,
 * and legacy/loose rows are treated as ungateable rather than locking
 * everyone out.
 */
const isWithinScope = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    if (opts.scope === 'ANYWHERE') {
        return { ok: true, reason: null, distanceKm: null, radiusKm: null };
    }
    const radiusKm = yield (0, exports.getScopeRadiusKm)(opts.scope);
    if (opts.questionLat == null || opts.questionLng == null) {
        return { ok: true, reason: null, distanceKm: null, radiusKm };
    }
    if (opts.viewerLat == null || opts.viewerLng == null) {
        return { ok: false, reason: 'NO_VIEWER_LOCATION', distanceKm: null, radiusKm };
    }
    const distanceKm = (0, geo_utils_1.calculateHaversineDistance)(opts.questionLat, opts.questionLng, opts.viewerLat, opts.viewerLng);
    if (radiusKm != null && distanceKm > radiusKm) {
        return { ok: false, reason: 'OUTSIDE_RADIUS', distanceKm, radiusKm };
    }
    return { ok: true, reason: null, distanceKm, radiusKm };
});
exports.isWithinScope = isWithinScope;
