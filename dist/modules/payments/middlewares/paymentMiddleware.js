"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePaymentVerification = exports.validatePaymentInitiation = exports.validateOnboarding = exports.validatePaymentAccountCreation = void 0;
const joi_1 = __importDefault(require("joi"));
const validate = (schema, req, res, next) => {
    const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });
    if (error) {
        return res.status(400).json({
            error: error.details[0].message,
            details: error.details.map((d) => d.message),
        });
    }
    req.body = value;
    next();
};
const validatePaymentAccountCreation = (req, res, next) => validate(joi_1.default.object({
    currency: joi_1.default.string().trim().length(3).required(),
}), req, res, next);
exports.validatePaymentAccountCreation = validatePaymentAccountCreation;
const validateOnboarding = (req, res, next) => validate(joi_1.default.object({
    country: joi_1.default.string().trim().length(2).optional(),
    bankCode: joi_1.default.string().trim().max(10).optional(),
    accountNumber: joi_1.default.string().trim().max(20).optional(),
}), req, res, next);
exports.validateOnboarding = validateOnboarding;
const validatePaymentInitiation = (req, res, next) => validate(joi_1.default.object({
    answerRequestId: joi_1.default.string().uuid().required(),
}), req, res, next);
exports.validatePaymentInitiation = validatePaymentInitiation;
const validatePaymentVerification = (req, res, next) => validate(joi_1.default.object({
    transactionId: joi_1.default.string().uuid().required(),
}), req, res, next);
exports.validatePaymentVerification = validatePaymentVerification;
