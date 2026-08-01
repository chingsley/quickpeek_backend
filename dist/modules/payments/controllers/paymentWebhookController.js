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
exports.handlePaystackWebhook = exports.handleStripeWebhook = void 0;
const client_1 = __importDefault(require("../../../core/database/prisma/client"));
const stripe_provider_1 = require("../providers/stripe.provider");
const paystack_provider_1 = require("../providers/paystack.provider");
const payments_service_1 = require("../services/payments.service");
/**
 * Shared post-parse handling for both providers. Unknown provider refs are
 * acknowledged quietly — providers deliver events for charges this app did
 * not initiate too.
 */
const processWebhookEvent = (event) => __awaiter(void 0, void 0, void 0, function* () {
    if (event.type === 'charge_succeeded') {
        yield (0, payments_service_1.finalizeChargeOutcome)({
            providerRef: event.providerRef,
            outcome: { status: 'succeeded', failureReason: null },
        });
    }
    else if (event.type === 'charge_failed') {
        yield (0, payments_service_1.finalizeChargeOutcome)({
            providerRef: event.providerRef,
            outcome: { status: 'failed', failureReason: event.failureReason },
        });
    }
    else if (event.type === 'account_updated') {
        yield client_1.default.paymentAccount.updateMany({
            where: { connectedAccountId: event.connectedAccountId },
            data: Object.assign({ payoutsEnabled: event.payoutsEnabled }, (event.payoutsEnabled ? { status: 'ACTIVE' } : {})),
        });
    }
});
/**
 * POST /payments/webhooks/stripe — mounted with `express.raw` before the
 * JSON parser so the signature covers the exact payload bytes.
 */
const handleStripeWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let event;
    try {
        event = stripe_provider_1.stripeProvider.parseWebhook(req.body, req.header('stripe-signature'));
    }
    catch (error) {
        return res.status(400).json({ error: error.message });
    }
    try {
        yield processWebhookEvent(event);
        return res.status(200).json({ received: true });
    }
    catch (error) {
        console.error('handleStripeWebhook error:', error);
        return res.status(500).json({ error: 'Webhook processing failed' });
    }
});
exports.handleStripeWebhook = handleStripeWebhook;
/** POST /payments/webhooks/paystack — raw body required for the HMAC. */
const handlePaystackWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let event;
    try {
        event = paystack_provider_1.paystackProvider.parseWebhook(req.body, req.header('x-paystack-signature'));
    }
    catch (error) {
        return res.status(400).json({ error: error.message });
    }
    try {
        yield processWebhookEvent(event);
        return res.status(200).json({ received: true });
    }
    catch (error) {
        console.error('handlePaystackWebhook error:', error);
        return res.status(500).json({ error: 'Webhook processing failed' });
    }
});
exports.handlePaystackWebhook = handlePaystackWebhook;
