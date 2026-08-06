"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loggingMiddleware = void 0;
const logger_1 = __importDefault(require("../../core/logger"));
const config_1 = __importDefault(require("config"));
const loggingEnabled = config_1.default.get('logger.enabled');
const logRequestBody = config_1.default.get('logger.logRequestBody');
const SUCCESS_STATUS_CODES = new Set([200, 201]);
const loggingMiddleware = (req, res, next) => {
    if (!loggingEnabled) {
        return next();
    }
    const start = Date.now();
    const { method, url, headers, body } = req;
    let responseBody;
    logger_1.default.info('Request', Object.assign({ method,
        url,
        headers }, (logRequestBody ? { body } : {})));
    const originalJson = res.json.bind(res);
    res.json = function json(body) {
        responseBody = body;
        return originalJson(body);
    };
    const originalSend = res.send.bind(res);
    res.send = function send(body) {
        if (responseBody === undefined) {
            responseBody = body;
        }
        return originalSend(body);
    };
    res.on('finish', () => {
        var _a;
        const status = res.statusCode;
        const duration = Date.now() - start;
        const meta = Object.assign(Object.assign(Object.assign({ method: req.method, url: req.originalUrl || url, status,
            duration }, (responseBody !== undefined ? { body: responseBody } : {})), (logRequestBody ? { requestBody: body } : {})), { userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId });
        if (SUCCESS_STATUS_CODES.has(status)) {
            logger_1.default.info('Response', meta);
            return;
        }
        if (status >= 500) {
            logger_1.default.error('Non-success response', meta);
        }
        else {
            logger_1.default.warn('Non-success response', meta);
        }
    });
    next();
};
exports.loggingMiddleware = loggingMiddleware;
