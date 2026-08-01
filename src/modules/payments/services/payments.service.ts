import { PaymentAccount, Transaction } from '@prisma/client';
import prisma from '../../../core/database/prisma/client';
import { emitToUser } from '../../../core/socket/socket.server';
import { createSystemMessage } from '../../../common/utils/messages.utils';
import { PaymentProviderDriver } from '../providers/paymentProvider.types';

export const toMinorUnits = (amount: number): number => Math.round(amount * 100);

export const fromMinorUnits = (amountMinor: number): number =>
  Math.round(amountMinor) / 100;

export const roundToTwo = (amount: number): number => Math.round(amount * 100) / 100;

export const computePlatformFeeMinor = (
  amountMinor: number,
  feePercent: number,
): number => (feePercent > 0 ? Math.round((amountMinor * feePercent) / 100) : 0);

export const serializeAccount = (account: PaymentAccount) => ({
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

export const serializeTransaction = (transaction: Transaction) => ({
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

/**
 * Returns the payer's provider customer id, creating + persisting one on
 * first use (this is what lets providers save cards for reuse).
 */
export const ensurePayerCustomer = async (opts: {
  account: PaymentAccount;
  user: { email: string; name: string };
  driver: PaymentProviderDriver;
}): Promise<string> => {
  if (opts.account.customerId) return opts.account.customerId;
  const { customerId } = await opts.driver.createCustomer({
    email: opts.user.email,
    name: opts.user.name,
  });
  await prisma.paymentAccount.update({
    where: { id: opts.account.id },
    data: { customerId },
  });
  return customerId;
};

export type TerminalChargeOutcome = {
  status: 'succeeded' | 'failed';
  failureReason: string | null;
};

/**
 * Idempotently moves a PENDING transaction to its terminal state and fires
 * the side effects (chat system message + per-user socket events) exactly
 * once: the PENDING guard on `updateMany` means only the first caller (a
 * webhook or the client's verify fallback) runs the side effects, retries
 * just read the finalized row.
 */
export const finalizeChargeOutcome = async (opts: {
  providerRef: string;
  outcome: TerminalChargeOutcome;
}): Promise<Transaction | null> => {
  const existing = await prisma.transaction.findUnique({
    where: { providerRef: opts.providerRef },
  });
  if (!existing) return null;

  const nextStatus = opts.outcome.status === 'succeeded' ? 'SUCCEEDED' : 'FAILED';
  const claimed = await prisma.transaction.updateMany({
    where: { id: existing.id, status: 'PENDING' },
    data: { status: nextStatus, failureReason: opts.outcome.failureReason },
  });

  const current = await prisma.transaction.findUnique({ where: { id: existing.id } });
  if (claimed.count === 0 || !current) return current;

  const socketPayload = {
    transactionId: current.id,
    answerRequestId: current.answerRequestId,
    amount: current.amount,
    currency: current.currency,
    status: current.status,
  };
  const succeeded = nextStatus === 'SUCCEEDED';
  emitToUser(current.payeeId, succeeded ? 'payment:received' : 'payment:failed', socketPayload);
  emitToUser(current.payerId, succeeded ? 'payment:succeeded' : 'payment:failed', socketPayload);

  if (current.answerRequestId && current.questionId) {
    const amountText = `${current.currency} ${current.amount.toFixed(2)}`;
    const text = succeeded
      ? `Payment of ${amountText} received.`
      : `Payment of ${amountText} failed${
          current.failureReason ? `: ${current.failureReason}` : '.'
        }`;
    await createSystemMessage({
      questionId: current.questionId,
      answerRequestId: current.answerRequestId,
      senderId: current.payerId,
      text,
      recipientIds: [current.payerId, current.payeeId],
    });
  }

  return current;
};
