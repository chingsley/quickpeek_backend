"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentWebhookController_1 = require("../controllers/paymentWebhookController");
// Mounted in app.ts with `express.raw` BEFORE the global JSON parser —
// signature verification needs the exact request bytes.
const router = (0, express_1.Router)();
router.post('/stripe', paymentWebhookController_1.handleStripeWebhook);
router.post('/paystack', paymentWebhookController_1.handlePaystackWebhook);
exports.default = router;
