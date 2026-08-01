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
exports.finalizeChargeOutcome = exports.ensurePayerCustomer = exports.serializeTransaction = exports.serializeAccount = exports.computePlatformFeeMinor = exports.roundToTwo = exports.fromMinorUnits = exports.toMinorUnits = void 0;
const client_1 = __importDefault(require("../../../core/database/prisma/client"));
const socket_server_1 = require("../../../core/socket/socket.server");
const messages_utils_1 = require("../../../common/utils/messages.utils");
const toMinorUnits = (amount) => Math.round(amount * 100);
exports.toMinorUnits = toMinorUnits;
const fromMinorUnits = (amountMinor) => Math.round(amountMinor) / 100;
exports.fromMinorUnits = fromMinorUnits;
const roundToTwo = (amount) => Math.round(amount * 100) / 100;
exports.roundToTwo = roundToTwo;
const computePlatformFeeMinor = (amountMinor, feePercent) => (feePercent > 0 ? Math.round((amountMinor * feePercent) / 100) : 0);
exports.computePlatformFeeMinor = computePlatformFeeMinor;
const serializeAccount = (account) => ({
    id: account.id,
    provider: account.provider,
    currency: account.currency,
    status: account.status,
    payoutsEnabled: account.payoutsEnabled,
    customerId: account.customerId,
    connectedAccountId: account.connectedAccountId,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
});
exports.serializeAccount = serializeAccount;
const serializeTransaction = (transaction) => ({
    id: transaction.id,
    provider: transaction.provider,
    type: transaction.type,
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency,
    platformFee: transaction.platformFee,
    payerId: transaction.payerId,
    payeeId: transaction.payeeId,
    questionId: transaction.questionId,
    answerRequestId: transaction.answerRequestId,
    providerRef: transaction.providerRef,
    failureReason: transaction.failureReason,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
});
exports.serializeTransaction = serializeTransaction;
/**
 * Returns the payer's provider customer id, creating + persisting one on
 * first use (this is what lets providers save cards for reuse).
 */
const ensurePayerCustomer = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    if (opts.account.customerId)
        return opts.account.customerId;
    const { customerId } = yield opts.driver.createCustomer({
        email: opts.user.email,
        name: opts.user.name,
    });
    yield client_1.default.paymentAccount.update({
        where: { id: opts.account.id },
        data: { customerId },
    });
    return customerId;
});
exports.ensurePayerCustomer = ensurePayerCustomer;
/**
 * Idempotently moves a PENDING transaction to its terminal state and fires
 * the side effects (chat system message + per-user socket events) exactly
 * once: the PENDING guard on `updateMany` means only the first caller (a
 * webhook or the client's verify fallback) runs the side effects, retries
 * just read the finalized row.
 */
const finalizeChargeOutcome = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield client_1.default.transaction.findUnique({
        where: { providerRef: opts.providerRef },
    });
    if (!existing)
        return null;
    const nextStatus = opts.outcome.status === 'succeeded' ? 'SUCCEEDED' : 'FAILED';
    const claimed = yield client_1.default.transaction.updateMany({
        where: { id: existing.id, status: 'PENDING' },
        data: { status: nextStatus, failureReason: opts.outcome.failureReason },
    });
    const current = yield client_1.default.transaction.findUnique({ where: { id: existing.id } });
    if (claimed.count === 0 || !current)
        return current;
    const socketPayload = {
        transactionId: current.id,
        answerRequestId: current.answerRequestId,
        amount: current.amount,
        currency: current.currency,
        status: current.status,
    };
    const succeeded = nextStatus === 'SUCCEEDED';
    (0, socket_server_1.emitToUser)(current.payeeId, succeeded ? 'payment:received' : 'payment:failed', socketPayload);
    (0, socket_server_1.emitToUser)(current.payerId, succeeded ? 'payment:succeeded' : 'payment:failed', socketPayload);
    if (current.answerRequestId && current.questionId) {
        const amountText = `${current.currency} ${current.amount.toFixed(2)}`;
        const text = succeeded
            ? `Payment of ${amountText} received.`
            : `Payment of ${amountText} failed${current.failureReason ? `: ${current.failureReason}` : '.'}`;
        yield (0, messages_utils_1.createSystemMessage)({
            questionId: current.questionId,
            answerRequestId: current.answerRequestId,
            senderId: current.payerId,
            text,
            recipientIds: [current.payerId, current.payeeId],
        });
    }
    return current;
});
exports.finalizeChargeOutcome = finalizeChargeOutcome;
