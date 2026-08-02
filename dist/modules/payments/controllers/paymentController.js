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
exports.onboardingReturnPage = exports.getWallet = exports.verifyPayment = exports.payForRequest = exports.listBanks = exports.getAccountStatus = exports.startOnboarding = exports.createPaymentAccount = exports.buildOnboardingRedirectUrl = exports.ONBOARDING_RETURN_PATH = void 0;
const client_1 = __importDefault(require("../../../core/database/prisma/client"));
const configService_1 = require("../../config/configService");
const providers_1 = require("../providers");
const currencies_1 = require("../providers/currencies");
const payments_service_1 = require("../services/payments.service");
const DEFAULT_WALLET_PAGE_SIZE = 20;
const MAX_WALLET_PAGE_SIZE = 100;
const parsePagination = (query) => {
    const page = Math.max(parseInt(String(query.page || '1'), 10), 1);
    const limit = Math.min(Math.max(parseInt(String(query.limit || String(DEFAULT_WALLET_PAGE_SIZE)), 10), 1), MAX_WALLET_PAGE_SIZE);
    return { page, limit, skip: (page - 1) * limit };
};
/**
 * Stripe validates AccountLink URLs strictly (scheme required). Tolerate an
 * empty or scheme-less FRONTEND_URL so a misconfigured dev env can't 500.
 */
const resolveOnboardingBaseUrl = () => {
    var _a;
    const raw = ((_a = process.env.FRONTEND_URL) !== null && _a !== void 0 ? _a : '').trim();
    if (!raw)
        return 'http://localhost:8081';
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};
/**
 * Stripe only accepts http(s) AccountLink URLs, so app deep links can't be
 * used directly. Instead Stripe redirects to this backend-hosted page, which
 * hands off into the app via the deep link (see onboardingReturnPage).
 */
exports.ONBOARDING_RETURN_PATH = '/api/v1/payments/onboarding/return';
/**
 * Public URL of this API as seen by the caller — the same base the phone
 * used for this request is guaranteed reachable from its browser.
 */
const buildApiBaseUrl = (req) => {
    var _a, _b, _c;
    const proto = (_a = req.header('x-forwarded-proto')) !== null && _a !== void 0 ? _a : req.protocol;
    const host = (_c = (_b = req.header('x-forwarded-host')) !== null && _b !== void 0 ? _b : req.header('host')) !== null && _c !== void 0 ? _c : 'localhost:3000';
    return `${proto}://${host}`;
};
/**
 * Turns the app's deep link into an https URL Stripe accepts, pointing at the
 * return page with the deep link as its handoff target. Hostless/unparsable
 * client URLs fall back to the server-built page URL (and are logged).
 * Exported for direct unit tests; the HTTP path is covered end-to-end.
 */
const buildOnboardingRedirectUrl = (req, clientUrl, fallback) => {
    if (clientUrl) {
        try {
            if (new URL(clientUrl).host) {
                return `${buildApiBaseUrl(req)}${exports.ONBOARDING_RETURN_PATH}?to=${encodeURIComponent(clientUrl)}`;
            }
            console.warn(`Ignoring hostless onboarding redirect URL: ${clientUrl}`);
        }
        catch (_a) {
            console.warn(`Ignoring unparsable onboarding redirect URL: ${clientUrl}`);
        }
    }
    return fallback;
};
exports.buildOnboardingRedirectUrl = buildOnboardingRedirectUrl;
/**
 * POST /payments/accounts
 * Creates the caller's payment account for a currency (provider derived from
 * it) or returns the existing one.
 */
const createPaymentAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const currency = req.body.currency.toUpperCase();
        const existing = yield client_1.default.paymentAccount.findUnique({ where: { userId } });
        if (existing) {
            return res
                .status(200)
                .json({ message: 'Successful', data: { account: (0, payments_service_1.serializeAccount)(existing) } });
        }
        const account = yield client_1.default.paymentAccount.create({
            data: { userId, currency, provider: (0, currencies_1.providerForCurrency)(currency) },
        });
        return res
            .status(201)
            .json({ message: 'Payment account created', data: { account: (0, payments_service_1.serializeAccount)(account) } });
    }
    catch (error) {
        console.error('createPaymentAccount error:', error);
        return res.status(500).json({ error: 'Failed to create payment account' });
    }
});
exports.createPaymentAccount = createPaymentAccount;
/**
 * POST /payments/accounts/onboarding
 * Responder payout setup. Stripe: returns a hosted onboarding link (creating
 * the Express account on first call). Paystack: validates bank details and
 * creates the payout subaccount immediately.
 */
const startOnboarding = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = req.user.userId;
        const account = yield client_1.default.paymentAccount.findUnique({ where: { userId } });
        if (!account) {
            return res.status(404).json({ error: 'Payment account not found' });
        }
        const driver = (0, providers_1.getPaymentProvider)(account.provider);
        const user = yield client_1.default.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true },
        });
        if (account.provider === 'STRIPE') {
            let connectedAccountId = account.connectedAccountId;
            if (!connectedAccountId) {
                const created = yield driver.createConnectedAccount({
                    email: user.email,
                    country: (_a = req.body.country) !== null && _a !== void 0 ? _a : 'US',
                });
                connectedAccountId = created.connectedAccountId;
                yield client_1.default.paymentAccount.update({
                    where: { id: account.id },
                    data: { connectedAccountId, status: 'ONBOARDING' },
                });
            }
            // The app passes its deep link; Stripe gets an https wrapper that
            // redirects back into the app (see ONBOARDING_RETURN_PATH).
            const base = resolveOnboardingBaseUrl();
            const { url } = yield driver.createOnboardingLink({
                connectedAccountId,
                refreshUrl: (0, exports.buildOnboardingRedirectUrl)(req, req.body.refreshUrl, `${base}/wallet/onboarding`),
                returnUrl: (0, exports.buildOnboardingRedirectUrl)(req, req.body.returnUrl, `${base}/wallet`),
            });
            const updated = yield client_1.default.paymentAccount.findUnique({ where: { id: account.id } });
            return res.status(200).json({
                message: 'Successful',
                data: { account: (0, payments_service_1.serializeAccount)(updated), onboardingUrl: url },
            });
        }
        const { bankCode, accountNumber } = req.body;
        if (!bankCode || !accountNumber) {
            return res
                .status(400)
                .json({ error: 'bankCode and accountNumber are required for Paystack onboarding' });
        }
        const { accountName } = yield driver.resolveBankAccount({ accountNumber, bankCode });
        const feePercent = yield (0, configService_1.getPlatformFeePercent)();
        const created = yield driver.createConnectedAccount({
            email: user.email,
            businessName: user.name,
            bankCode,
            accountNumber,
            percentageCharge: 100 - feePercent,
        });
        const updated = yield client_1.default.paymentAccount.update({
            where: { id: account.id },
            data: {
                connectedAccountId: created.connectedAccountId,
                status: 'ACTIVE',
                payoutsEnabled: true,
            },
        });
        return res.status(200).json({
            message: 'Successful',
            data: { account: (0, payments_service_1.serializeAccount)(updated), accountName },
        });
    }
    catch (error) {
        console.error('startOnboarding error:', error);
        return res.status(500).json({ error: 'Failed to start payout onboarding' });
    }
});
exports.startOnboarding = startOnboarding;
/**
 * GET /payments/accounts/status
 * Returns the caller's account (null when not created). Stripe connected
 * accounts are refreshed against the provider so completed onboarding flips
 * the account to ACTIVE.
 */
const getAccountStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const account = yield client_1.default.paymentAccount.findUnique({ where: { userId } });
        if (!account) {
            return res.status(200).json({ message: 'Successful', data: { account: null } });
        }
        if (account.provider === 'STRIPE' && account.connectedAccountId) {
            const providerStatus = yield (0, providers_1.getPaymentProvider)(account.provider).getConnectedAccountStatus(account.connectedAccountId);
            const updated = yield client_1.default.paymentAccount.update({
                where: { id: account.id },
                data: {
                    payoutsEnabled: providerStatus.payoutsEnabled,
                    status: providerStatus.payoutsEnabled ? 'ACTIVE' : account.status,
                },
            });
            return res
                .status(200)
                .json({ message: 'Successful', data: { account: (0, payments_service_1.serializeAccount)(updated) } });
        }
        return res
            .status(200)
            .json({ message: 'Successful', data: { account: (0, payments_service_1.serializeAccount)(account) } });
    }
    catch (error) {
        console.error('getAccountStatus error:', error);
        return res.status(500).json({ error: 'Failed to fetch payment account status' });
    }
});
exports.getAccountStatus = getAccountStatus;
/**
 * GET /payments/banks
 * Bank directory for the Paystack payout setup form.
 */
const listBanks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const account = yield client_1.default.paymentAccount.findUnique({ where: { userId } });
        if (!account) {
            return res.status(404).json({ error: 'Payment account not found' });
        }
        if (account.provider !== 'PAYSTACK') {
            return res
                .status(400)
                .json({ error: 'Bank listing is only available for Paystack accounts' });
        }
        const banks = yield (0, providers_1.getPaymentProvider)(account.provider).listBanks();
        return res.status(200).json({ message: 'Successful', data: { banks } });
    }
    catch (error) {
        console.error('listBanks error:', error);
        return res.status(500).json({ error: 'Failed to list banks' });
    }
});
exports.listBanks = listBanks;
/**
 * POST /payments/pay
 * Questioner initiates payment of the question price to the responder of an
 * ACCEPTED request. Returns the provider payload the client needs to confirm
 * the charge (Stripe PaymentSheet secrets / Paystack checkout URL).
 */
const payForRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const { answerRequestId } = req.body;
        const answerRequest = yield client_1.default.answerRequest.findUnique({
            where: { id: answerRequestId },
            include: { question: { select: { id: true, title: true, price: true } } },
        });
        if (!answerRequest) {
            return res.status(404).json({ error: 'Request not found' });
        }
        if (answerRequest.questionerId !== userId) {
            return res.status(403).json({ error: 'Only the questioner can pay for this request' });
        }
        if (answerRequest.status !== 'ACCEPTED') {
            return res
                .status(409)
                .json({ error: `Cannot pay while request is ${answerRequest.status}` });
        }
        const payeeAccount = yield client_1.default.paymentAccount.findUnique({
            where: { userId: answerRequest.responderId },
        });
        if (!payeeAccount || !payeeAccount.payoutsEnabled || !payeeAccount.connectedAccountId) {
            return res.status(409).json({ error: 'The responder cannot receive payments yet' });
        }
        if (answerRequest.question.price <= 0) {
            return res.status(400).json({ error: 'Question has no payable amount' });
        }
        let payerAccount = yield client_1.default.paymentAccount.findUnique({ where: { userId } });
        if (!payerAccount) {
            payerAccount = yield client_1.default.paymentAccount.create({
                data: { userId, provider: payeeAccount.provider, currency: payeeAccount.currency },
            });
        }
        if (payerAccount.currency !== payeeAccount.currency ||
            payerAccount.provider !== payeeAccount.provider) {
            return res.status(409).json({
                error: 'Your payment account currency does not match the responder payout currency',
            });
        }
        const existing = yield client_1.default.transaction.findUnique({
            where: { answerRequestId: answerRequest.id },
        });
        if ((existing === null || existing === void 0 ? void 0 : existing.status) === 'SUCCEEDED') {
            return res.status(409).json({ error: 'This request has already been paid' });
        }
        const driver = (0, providers_1.getPaymentProvider)(payeeAccount.provider);
        const payer = yield client_1.default.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true },
        });
        const customerId = yield (0, payments_service_1.ensurePayerCustomer)({
            account: payerAccount,
            user: payer,
            driver,
        });
        const amountMinor = (0, payments_service_1.toMinorUnits)(answerRequest.question.price);
        const platformFeeMinor = (0, payments_service_1.computePlatformFeeMinor)(amountMinor, yield (0, configService_1.getPlatformFeePercent)());
        const charge = yield driver.createCharge({
            amountMinor,
            currency: payeeAccount.currency,
            payerEmail: payer.email,
            customerId,
            connectedAccountId: payeeAccount.connectedAccountId,
            platformFeeMinor,
            idempotencyKey: answerRequest.id,
            metadata: {
                answerRequestId: answerRequest.id,
                questionId: answerRequest.question.id,
            },
        });
        const data = {
            provider: payeeAccount.provider,
            type: 'QUESTION_PAYMENT',
            status: 'PENDING',
            amount: answerRequest.question.price,
            currency: payeeAccount.currency,
            platformFee: (0, payments_service_1.fromMinorUnits)(platformFeeMinor),
            payerId: userId,
            payeeId: answerRequest.responderId,
            questionId: answerRequest.question.id,
            answerRequestId: answerRequest.id,
            providerRef: charge.providerRef,
            failureReason: null,
        };
        // Retry-safe: a previous abandoned attempt is reset in place rather than
        // duplicated (answerRequestId is unique).
        const transaction = existing
            ? yield client_1.default.transaction.update({ where: { id: existing.id }, data })
            : yield client_1.default.transaction.create({ data });
        return res.status(201).json({
            message: 'Payment initiated',
            data: Object.assign(Object.assign({ transaction: (0, payments_service_1.serializeTransaction)(transaction) }, (charge.stripe ? { stripe: charge.stripe } : {})), (charge.paystack ? { paystack: charge.paystack } : {})),
        });
    }
    catch (error) {
        console.error('payForRequest error:', error);
        return res.status(500).json({ error: 'Failed to initiate payment' });
    }
});
exports.payForRequest = payForRequest;
/**
 * POST /payments/pay/verify
 * Client fallback to the webhooks: re-checks a charge with the provider and
 * finalizes the transaction (idempotent).
 */
const verifyPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const { transactionId } = req.body;
        const transaction = yield client_1.default.transaction.findUnique({ where: { id: transactionId } });
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        if (transaction.payerId !== userId && transaction.payeeId !== userId) {
            return res.status(403).json({ error: 'Not a participant in this transaction' });
        }
        if (transaction.status !== 'PENDING') {
            return res
                .status(200)
                .json({ message: 'Successful', data: { transaction: (0, payments_service_1.serializeTransaction)(transaction) } });
        }
        const driver = (0, providers_1.getPaymentProvider)(transaction.provider);
        const outcome = yield driver.retrieveCharge(transaction.providerRef);
        const updated = outcome.status === 'pending'
            ? transaction
            : yield (0, payments_service_1.finalizeChargeOutcome)({
                providerRef: transaction.providerRef,
                outcome: { status: outcome.status, failureReason: outcome.failureReason },
            });
        return res.status(200).json({
            message: 'Successful',
            data: { transaction: (0, payments_service_1.serializeTransaction)(updated !== null && updated !== void 0 ? updated : transaction) },
        });
    }
    catch (error) {
        console.error('verifyPayment error:', error);
        return res.status(500).json({ error: 'Failed to verify payment' });
    }
});
exports.verifyPayment = verifyPayment;
/**
 * GET /payments/wallet
 * Dashboard: net earnings, spend and answered-question counts per currency,
 * plus the paginated transaction list with counterparties and questions.
 */
const getWallet = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const { page, limit, skip } = parsePagination(req.query);
        const [earnedGroups, spentGroups, total, rows] = yield Promise.all([
            client_1.default.transaction.groupBy({
                by: ['currency'],
                where: { payeeId: userId, status: 'SUCCEEDED' },
                _sum: { amount: true, platformFee: true },
                _count: { _all: true },
            }),
            client_1.default.transaction.groupBy({
                by: ['currency'],
                where: { payerId: userId, status: 'SUCCEEDED' },
                _sum: { amount: true },
                _count: { _all: true },
            }),
            client_1.default.transaction.count({
                where: { OR: [{ payerId: userId }, { payeeId: userId }] },
            }),
            client_1.default.transaction.findMany({
                where: { OR: [{ payerId: userId }, { payeeId: userId }] },
                include: {
                    payer: { select: { id: true, name: true, username: true } },
                    payee: { select: { id: true, name: true, username: true } },
                    question: { select: { id: true, title: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);
        // Earnings are shown net of the platform fee — what the responder
        // actually receives. Sums over non-null columns are never null here.
        const earned = earnedGroups.map((group) => ({
            currency: group.currency,
            amount: (0, payments_service_1.roundToTwo)(group._sum.amount - group._sum.platformFee),
            count: group._count._all,
        }));
        const spent = spentGroups.map((group) => ({
            currency: group.currency,
            amount: (0, payments_service_1.roundToTwo)(group._sum.amount),
            count: group._count._all,
        }));
        const questionsAnswered = earnedGroups.reduce((n, group) => n + group._count._all, 0);
        const items = rows.map((t) => {
            const isPayee = t.payeeId === userId;
            return {
                id: t.id,
                type: t.type,
                status: t.status,
                amount: t.amount,
                currency: t.currency,
                platformFee: t.platformFee,
                direction: isPayee ? 'earned' : 'spent',
                counterparty: isPayee ? t.payer : t.payee,
                question: t.question,
                answerRequestId: t.answerRequestId,
                failureReason: t.failureReason,
                createdAt: t.createdAt.toISOString(),
                updatedAt: t.updatedAt.toISOString(),
            };
        });
        return res.status(200).json({
            message: 'Successful',
            data: {
                totals: { earned, spent, questionsAnswered },
                transactions: {
                    items,
                    pagination: { page, limit, total, hasMore: skip + items.length < total },
                },
            },
        });
    }
    catch (error) {
        console.error('getWallet error:', error);
        return res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});
exports.getWallet = getWallet;
const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
})[char]);
const renderOnboardingReturnPage = (deepLink) => {
    const handoff = deepLink
        ? `<a href="${escapeHtml(deepLink)}" style="background:#0c538f;color:#fff;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:700">Return to QuickPeek</a>
    <script>window.location.replace(${JSON.stringify(deepLink)});</script>`
        : '<p>You can close this page and return to the QuickPeek app.</p>';
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Return to QuickPeek</title>
  </head>
  <body style="font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#ffffff;color:#1A1A2E;text-align:center;padding:24px">
    <h2>You're all set</h2>
    <p>Finish up back in the QuickPeek app.</p>
    ${handoff}
  </body>
</html>`;
};
/**
 * GET /payments/onboarding/return?to=<deep link>
 * Public handoff page Stripe redirects to after hosted onboarding. Stripe
 * only accepts http(s) URLs, so this https page performs the final hop into
 * the app. The `to` deep link is validated (host + safe scheme) before being
 * embedded; anything else renders a plain "close this page" page.
 */
const onboardingReturnPage = (req, res) => {
    const to = typeof req.query.to === 'string' ? req.query.to : null;
    let deepLink = null;
    if (to) {
        try {
            const url = new URL(to);
            const unsafeProtocols = ['javascript:', 'data:', 'file:', 'vbscript:'];
            if (url.host && !unsafeProtocols.includes(url.protocol)) {
                deepLink = to;
            }
        }
        catch (_a) {
            deepLink = null;
        }
    }
    return res.status(200).type('html').send(renderOnboardingReturnPage(deepLink));
};
exports.onboardingReturnPage = onboardingReturnPage;
