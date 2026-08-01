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
exports.stripeProvider = exports.STRIPE_API_VERSION = void 0;
const stripe_1 = __importDefault(require("stripe"));
/**
 * Pinned to the API version bundled with the installed SDK. Ephemeral key
 * creation rejects requests that omit an explicit API version.
 */
exports.STRIPE_API_VERSION = '2026-07-29.dahlia';
let client = null;
const getClient = () => {
    if (!client) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key)
            throw new Error('STRIPE_SECRET_KEY is not configured');
        client = new stripe_1.default(key);
    }
    return client;
};
const webhookSecret = () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret)
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    return secret;
};
exports.stripeProvider = {
    provider: 'STRIPE',
    createCustomer(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const customer = yield getClient().customers.create({
                email: input.email,
                name: input.name,
            });
            return { customerId: customer.id };
        });
    },
    createConnectedAccount(input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const account = yield getClient().accounts.create({
                type: 'express',
                email: input.email,
                country: (_a = input.country) !== null && _a !== void 0 ? _a : 'US',
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
            });
            return { connectedAccountId: account.id };
        });
    },
    createOnboardingLink(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const link = yield getClient().accountLinks.create({
                account: input.connectedAccountId,
                refresh_url: input.refreshUrl,
                return_url: input.returnUrl,
                type: 'account_onboarding',
            });
            return { url: link.url };
        });
    },
    getConnectedAccountStatus(connectedAccountId) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = yield getClient().accounts.retrieve(connectedAccountId);
            return {
                chargesEnabled: account.charges_enabled,
                payoutsEnabled: account.payouts_enabled,
                detailsSubmitted: account.details_submitted,
            };
        });
    },
    createCharge(input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const params = {
                amount: input.amountMinor,
                currency: input.currency.toLowerCase(),
                customer: (_a = input.customerId) !== null && _a !== void 0 ? _a : undefined,
                automatic_payment_methods: { enabled: true },
                transfer_data: { destination: input.connectedAccountId },
                metadata: input.metadata,
            };
            if (input.platformFeeMinor > 0) {
                params.application_fee_amount = input.platformFeeMinor;
            }
            const intent = yield getClient().paymentIntents.create(params, {
                idempotencyKey: input.idempotencyKey,
            });
            const ephemeralKey = yield getClient().ephemeralKeys.create({ customer: input.customerId }, { apiVersion: exports.STRIPE_API_VERSION });
            return {
                providerRef: intent.id,
                stripe: {
                    clientSecret: intent.client_secret,
                    customerId: input.customerId,
                    ephemeralKey: ephemeralKey.secret,
                },
            };
        });
    },
    retrieveCharge(providerRef) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const intent = yield getClient().paymentIntents.retrieve(providerRef);
            if (intent.status === 'succeeded') {
                return { status: 'succeeded', failureReason: null };
            }
            if (intent.status === 'canceled' || intent.status === 'requires_payment_method') {
                return {
                    status: 'failed',
                    failureReason: (_b = (_a = intent.last_payment_error) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : null,
                };
            }
            return { status: 'pending', failureReason: null };
        });
    },
    parseWebhook(rawBody, signatureHeader) {
        var _a, _b;
        const secret = webhookSecret();
        let event;
        try {
            event = getClient().webhooks.constructEvent(rawBody, signatureHeader !== null && signatureHeader !== void 0 ? signatureHeader : '', secret);
        }
        catch (_c) {
            throw new Error('Invalid Stripe webhook signature');
        }
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const intent = event.data.object;
                return { type: 'charge_succeeded', providerRef: intent.id };
            }
            case 'payment_intent.payment_failed': {
                const intent = event.data.object;
                return {
                    type: 'charge_failed',
                    providerRef: intent.id,
                    failureReason: (_b = (_a = intent.last_payment_error) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : null,
                };
            }
            case 'account.updated': {
                const account = event.data.object;
                return {
                    type: 'account_updated',
                    connectedAccountId: account.id,
                    payoutsEnabled: account.payouts_enabled,
                };
            }
            default:
                return { type: 'ignored' };
        }
    },
};
