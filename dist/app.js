"use strict";
// src / app.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logging_middleware_1 = require("./api/middlewares/logging.middleware");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const questionRoutes_1 = __importDefault(require("./modules/questions/routes/questionRoutes"));
const categoryRoutes_1 = __importDefault(require("./modules/categories/routes/categoryRoutes"));
const requestRoutes_1 = __importDefault(require("./modules/requests/routes/requestRoutes"));
const healthRoute_1 = __importDefault(require("./api/routes/healthRoute"));
const userRoutes_1 = __importDefault(require("./modules/users/routes/userRoutes"));
const configRoutes_1 = __importDefault(require("./modules/config/routes/configRoutes"));
const paymentRoutes_1 = __importDefault(require("./modules/payments/routes/paymentRoutes"));
const paymentWebhookRoutes_1 = __importDefault(require("./modules/payments/routes/paymentWebhookRoutes"));
const app = (0, express_1.default)();
// Disable ETag so mobile clients don't get 304 responses with empty bodies.
app.set('etag', false);
// Required when requests arrive via a proxy (e.g. Expo tunnel) so
// express-rate-limit can safely read X-Forwarded-For.
app.set('trust proxy', 1);
// Stripe/Paystack webhooks must see the raw payload for signature
// verification, so this router mounts before the global JSON parser.
app.use('/api/v1/payments/webhooks', express_1.default.raw({ type: 'application/json' }), paymentWebhookRoutes_1.default);
app.use(express_1.default.json());
app.use((0, cors_1.default)());
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    next();
});
app.use(logging_middleware_1.loggingMiddleware);
app.use('/api/v1/health', healthRoute_1.default);
app.use('/api/v1/config', configRoutes_1.default);
app.use('/api/v1/questions', questionRoutes_1.default);
app.use('/api/v1/categories', categoryRoutes_1.default);
app.use('/api/v1/requests', requestRoutes_1.default);
app.use('/api/v1/users', userRoutes_1.default);
app.use('/api/v1/payments', paymentRoutes_1.default);
app.use((error, req, res, next) => {
    if (error) {
        if (typeof error === 'object') {
            res.status(500).json({ error: error.message });
        }
        else {
            res.status(500).json({ error: error });
        }
    }
    else {
        next();
    }
});
app.all(['/', '/ping'], function (req, res) {
    res.status(200).json('success');
});
app.use(function (req, res) {
    res.status(404).json({ error: 'path not found' });
});
exports.default = app;
