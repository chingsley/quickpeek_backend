"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.answerSubmissionLimiter = exports.nearbyReadLimiter = exports.questionCreationLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
/**
 * Rate limits for the question endpoints. Tuned conservatively for a mobile
 * app where accidental retry storms are more likely than real abuse.
 */
exports.questionCreationLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30, // 30 question drafts / assigns per hour per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many question actions from this IP, please try again later.' },
});
exports.nearbyReadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 nearby reads per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
});
exports.answerSubmissionLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 60, // 60 answer submissions per hour per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many answer submissions from this IP, please try again later.' },
});
