"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSendMessage = void 0;
const joi_1 = __importDefault(require("joi"));
const validateSendMessage = (req, res, next) => {
    const schema = joi_1.default.object({
        text: joi_1.default.string().trim().min(1).max(2000).required(),
        replyToId: joi_1.default.string().uuid().optional(),
    });
    const { error } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }
    next();
};
exports.validateSendMessage = validateSendMessage;
