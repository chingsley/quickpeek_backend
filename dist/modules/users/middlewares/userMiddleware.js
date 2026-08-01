"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUserProfileUpdate = exports.validateUserLogin = exports.validateUserRegistration = void 0;
const joi_1 = __importDefault(require("joi"));
const validateUserRegistration = (req, res, next) => {
    const schema = joi_1.default.object({
        name: joi_1.default.string().min(3).max(30).required(),
        username: joi_1.default.string().lowercase().min(3).max(30).required(),
        email: joi_1.default.string().lowercase().email().required(),
        password: joi_1.default.string().min(6).required(),
        deviceType: joi_1.default.string().trim().valid('android', 'ios', 'web').required(),
        deviceToken: joi_1.default.string().trim().allow('').optional(),
        notificationsEnabled: joi_1.default.when('deviceToken', {
            is: joi_1.default.exist().not('').not(null), // Truthy and not empty string and not null
            then: joi_1.default.boolean().valid(true),
            otherwise: joi_1.default.boolean().valid(false)
        }),
        locationSharingEnabled: joi_1.default.bool().required(),
        longitude: joi_1.default.number().optional(),
        latitude: joi_1.default.number().optional()
    });
    const { error, value } = schema.validate(req.body);
    if (error)
        return res.status(400).json({ error: error.details[0].message });
    req.body = Object.assign(Object.assign({}, value), { notificationsEnabled: !!value.deviceToken // if token is '' then notificationEnabled = false, else, true
     });
    next();
};
exports.validateUserRegistration = validateUserRegistration;
const validateUserLogin = (req, res, next) => {
    const schema = joi_1.default.object({
        email: joi_1.default.string().lowercase().email().required(),
        password: joi_1.default.string().min(6).required(),
        deviceType: joi_1.default.string().trim().valid(...['android', 'ios', 'web']).required(),
        deviceToken: joi_1.default.string().trim().allow('').optional(),
        notificationsEnabled: joi_1.default.when('deviceToken', {
            is: joi_1.default.exist().not('').not(null), // Truthy and not empty string and not null
            then: joi_1.default.boolean().valid(true),
            otherwise: joi_1.default.boolean().valid(false)
        }),
        locationSharingEnabled: joi_1.default.bool().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error)
        return res.status(400).json({ error: error.details[0].message });
    req.body = value;
    next();
};
exports.validateUserLogin = validateUserLogin;
const validateUserProfileUpdate = (req, res, next) => {
    const schema = joi_1.default.object({
        name: joi_1.default.string().min(3).max(30).optional(),
        username: joi_1.default.string().lowercase().min(3).max(30).optional(),
        notificationsEnabled: joi_1.default.boolean().optional(),
        locationSharingEnabled: joi_1.default.boolean().optional(),
        profileImageUrl: joi_1.default.string().uri().allow('', null).optional(),
    }).min(1); // at least one field must be provided
    const { error, value } = schema.validate(req.body);
    if (error)
        return res.status(400).json({ error: error.details[0].message });
    req.body = value;
    next();
};
exports.validateUserProfileUpdate = validateUserProfileUpdate;
