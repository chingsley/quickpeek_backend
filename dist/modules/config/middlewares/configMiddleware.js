"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMarketConfigUpdate = void 0;
const joi_1 = __importDefault(require("joi"));
/**
 * Validates the PUT /config body. Every field is optional — only the supplied
 * ones are applied. At least one must be present.
 */
const validateMarketConfigUpdate = (req, res, next) => {
    const schema = joi_1.default.object({
        nearMeRadiusKm: joi_1.default.number().min(0.1).max(500).optional(),
        reviewRevealWindowDays: joi_1.default.number().integer().min(1).max(90).optional(),
        radiusExactSpotKm: joi_1.default.number().min(0.05).max(10).optional(),
        radiusWalkingKm: joi_1.default.number().min(0.1).max(20).optional(),
        radiusNeighbourhoodKm: joi_1.default.number().min(0.5).max(50).optional(),
        radiusCityKm: joi_1.default.number().min(1).max(500).optional(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }
    req.body = value;
    next();
};
exports.validateMarketConfigUpdate = validateMarketConfigUpdate;
