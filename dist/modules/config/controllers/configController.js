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
exports.updateMarketConfig = exports.getMarketConfig = void 0;
const configService_1 = require("../configService");
/**
 * GET /config
 * Public. Returns the market-wide runtime config consumed by the FE
 * (display text, near-me radius, etc.). Filter logic still runs BE-side.
 */
const getMarketConfig = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const nearMeRadiusKm = yield (0, configService_1.getMarketConfigValue)(configService_1.MARKET_CONFIG_KEYS.nearMeRadiusKm);
        const reviewRevealWindowDays = yield (0, configService_1.getMarketConfigValue)(configService_1.MARKET_CONFIG_KEYS.reviewRevealWindowDays);
        const data = { nearMeRadiusKm, reviewRevealWindowDays };
        return res.status(200).json({ message: 'Successful', data });
    }
    catch (error) {
        console.error('getMarketConfig error:', error);
        return res.status(500).json({ error: 'Failed to fetch market config' });
    }
});
exports.getMarketConfig = getMarketConfig;
/**
 * PUT /config
 * Admin-only. Updates the market config values that are exposed via GET /config.
 */
const updateMarketConfig = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { nearMeRadiusKm, reviewRevealWindowDays } = req.body;
        if (nearMeRadiusKm != null) {
            yield (0, configService_1.setMarketConfigValue)(configService_1.MARKET_CONFIG_KEYS.nearMeRadiusKm, nearMeRadiusKm);
        }
        if (reviewRevealWindowDays != null) {
            yield (0, configService_1.setMarketConfigValue)(configService_1.MARKET_CONFIG_KEYS.reviewRevealWindowDays, reviewRevealWindowDays);
        }
        const data = {
            nearMeRadiusKm: yield (0, configService_1.getMarketConfigValue)(configService_1.MARKET_CONFIG_KEYS.nearMeRadiusKm),
            reviewRevealWindowDays: yield (0, configService_1.getMarketConfigValue)(configService_1.MARKET_CONFIG_KEYS.reviewRevealWindowDays),
        };
        return res.status(200).json({ message: 'Config updated', data });
    }
    catch (error) {
        console.error('updateMarketConfig error:', error);
        return res.status(500).json({ error: 'Failed to update market config' });
    }
});
exports.updateMarketConfig = updateMarketConfig;
