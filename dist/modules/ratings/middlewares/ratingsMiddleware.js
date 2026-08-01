"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAnswerRatingsCreation = void 0;
const joi_1 = __importDefault(require("joi"));
const validateAnswerRatingsCreation = (req, res, next) => {
    const schema = joi_1.default.object({
        answerId: joi_1.default.string().required(),
        rating: joi_1.default.number().integer().min(1).max(5).required(),
        feedback: joi_1.default.string(),
    });
    const { error } = schema.validate(req.body);
    if (error)
        return res.status(400).json({ error: error.details[0].message });
    next();
};
exports.validateAnswerRatingsCreation = validateAnswerRatingsCreation;
