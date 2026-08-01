"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUpdateCategory = exports.validateCreateCategory = void 0;
const joi_1 = __importDefault(require("joi"));
const slugPattern = /^[a-z0-9-]+$/;
const validateCreateCategory = (req, res, next) => {
    const schema = joi_1.default.object({
        name: joi_1.default.string().trim().min(2).max(50).required(),
        slug: joi_1.default.string()
            .trim()
            .lowercase()
            .min(2)
            .max(50)
            .pattern(slugPattern)
            .message('slug may only contain lowercase letters, numbers, and hyphens')
            .optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error)
        return res.status(400).json({ error: error.details[0].message });
    req.body = value;
    next();
};
exports.validateCreateCategory = validateCreateCategory;
const validateUpdateCategory = (req, res, next) => {
    const schema = joi_1.default.object({
        name: joi_1.default.string().trim().min(2).max(50).optional(),
        slug: joi_1.default.string()
            .trim()
            .lowercase()
            .min(2)
            .max(50)
            .pattern(slugPattern)
            .message('slug may only contain lowercase letters, numbers, and hyphens')
            .optional(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error)
        return res.status(400).json({ error: error.details[0].message });
    req.body = value;
    next();
};
exports.validateUpdateCategory = validateUpdateCategory;
