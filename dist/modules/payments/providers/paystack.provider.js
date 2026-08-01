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
exports.paystackProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const PAYSTACK_BASE_URL = 'https://api.paystack.co';
/**
 * Recognizable URL Paystack redirects to after checkout. The RN WebView
 * watches for this path in `onNavigationStateChange`; no real page is served.
 */
const callbackUrl = () => { var _a; return (_a = process.env.PAYSTACK_CALLBACK_URL) !== null && _a !== void 0 ? _a : 'https://payments.quickpeek.local/paystack/callback'; };
const paystackRequest = (method, path, body) => __awaiter(void 0, void 0, void 0, function* () {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret)
        throw new Error('PAYSTACK_SECRET_KEY is not configured');
    const res = yield fetch(`${PAYSTACK_BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = (yield res.json());
    if (!res.ok || !json.status) {
        throw new Error(json.message || `Paystack request failed (${res.status})`);
    }
    return json.data;
});
exports.paystackProvider = {
    provider: 'PAYSTACK',
    createCustomer(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const [firstName, ...rest] = input.name.trim().split(/\s+/);
            const data = yield paystackRequest('POST', '/customer', {
                email: input.email,
                first_name: firstName,
                last_name: rest.length > 0 ? rest.join(' ') : firstName,
            });
            return { customerId: data.customer_code };
        });
    },
    createConnectedAccount(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield paystackRequest('POST', '/subaccount', {
                business_name: input.businessName,
                settlement_bank: input.bankCode,
                account_number: input.accountNumber,
                percentage_charge: input.percentageCharge,
            });
            return { connectedAccountId: data.subaccount_code };
        });
    },
    getConnectedAccountStatus(connectedAccountId) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield paystackRequest('GET', `/subaccount/${connectedAccountId}`);
            return {
                chargesEnabled: data.active,
                payoutsEnabled: data.active,
                detailsSubmitted: true,
            };
        });
    },
    createCharge(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield paystackRequest('POST', '/transaction/initialize', {
                email: input.payerEmail,
                amount: input.amountMinor,
                currency: input.currency,
                subaccount: input.connectedAccountId,
                // The subaccount bears Paystack's processing fee so the platform's
                // percentage (set at subaccount creation) is exact.
                bearer: 'subaccount',
                reference: `${input.idempotencyKey}_${Date.now()}`,
                callback_url: callbackUrl(),
                metadata: input.metadata,
            });
            return {
                providerRef: data.reference,
                paystack: { authorizationUrl: data.authorization_url },
            };
        });
    },
    retrieveCharge(providerRef) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const data = yield paystackRequest('GET', `/transaction/verify/${providerRef}`);
            if (data.status === 'success') {
                return { status: 'succeeded', failureReason: null };
            }
            if (data.status === 'failed' || data.status === 'abandoned') {
                return { status: 'failed', failureReason: (_a = data.gateway_response) !== null && _a !== void 0 ? _a : null };
            }
            return { status: 'pending', failureReason: null };
        });
    },
    parseWebhook(rawBody, signatureHeader) {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret)
            throw new Error('PAYSTACK_SECRET_KEY is not configured');
        const expected = crypto_1.default.createHmac('sha512', secret).update(rawBody).digest('hex');
        if (expected !== signatureHeader) {
            throw new Error('Invalid Paystack webhook signature');
        }
        const event = JSON.parse(rawBody.toString('utf8'));
        if (event.event === 'charge.success') {
            return { type: 'charge_succeeded', providerRef: event.data.reference };
        }
        return { type: 'ignored' };
    },
    listBanks() {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield paystackRequest('GET', '/bank?currency=NGN&perPage=100');
            return data.map((bank) => ({ name: bank.name, code: bank.code }));
        });
    },
    resolveBankAccount(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield paystackRequest('GET', `/bank/resolve?account_number=${input.accountNumber}&bank_code=${input.bankCode}`);
            return { accountName: data.account_name };
        });
    },
};
