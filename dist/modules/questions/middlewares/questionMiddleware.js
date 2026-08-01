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
exports.validateQuestionCreation = void 0;
const joi_1 = __importDefault(require("joi"));
const client_1 = __importDefault(require("../../../core/database/prisma/client"));
const LATITUDE = joi_1.default.number().min(-90).max(90).precision(14);
const LONGITUDE = joi_1.default.number().min(-180).max(180).precision(14);
const DEFAULT_CATEGORY_SLUG = 'other';
/**
 * Validates the new question payload.
 * Location fields are optional; if `latitude`/`longitude` are present,
 * `address` is required so the question can be displayed on the feed map.
 * `restrictToNearby` (when true) limits answering to viewers within the
 * market-wide near-me radius of the question's coordinates.
 */
const validateQuestionCreation = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const schema = joi_1.default.object({
        title: joi_1.default.string().trim().min(5).max(120).required(),
        detail: joi_1.default.string().trim().min(10).max(2000).required(),
        price: joi_1.default.number().min(0).max(10000).required(),
        acceptanceCriteria: joi_1.default.string().trim().min(5).max(1000).required(),
        latitude: LATITUDE.optional().allow(null),
        longitude: LONGITUDE.optional().allow(null),
        address: joi_1.default.string().trim().max(300).optional().allow(null, ''),
        restrictToNearby: joi_1.default.boolean().default(false),
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
        return res.status(400).json({
            error: error.details[0].message,
            details: error.details.map((d) => d.message),
        });
    }
    // Location must be supplied as a complete set or omitted entirely.
    const hasAnyLocationField = value.latitude !== undefined ||
        value.longitude !== undefined ||
        value.address !== undefined;
    if (hasAnyLocationField &&
        (value.latitude == null || value.longitude == null || !value.address)) {
        return res.status(400).json({
            error: 'When location is provided, latitude, longitude and address are all required',
        });
    }
    // Assign default category while category selection is deferred in the UI.
    const defaultCategory = yield client_1.default.category.findUnique({
        where: { slug: DEFAULT_CATEGORY_SLUG },
        select: { id: true },
    });
    if (!defaultCategory) {
        return res.status(500).json({ error: 'Default category is not configured' });
    }
    req.body = Object.assign(Object.assign({}, value), { categoryId: defaultCategory.id });
    next();
});
exports.validateQuestionCreation = validateQuestionCreation;
