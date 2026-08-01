import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import { getPlatformFeePercent } from '../../config/configService';
import { getPaymentProvider } from '../providers';
import { providerForCurrency } from '../providers/currencies';
import {
  computePlatformFeeMinor,
  ensurePayerCustomer,
  finalizeChargeOutcome,
  fromMinorUnits,
  roundToTwo,
  serializeAccount,
  serializeTransaction,
  toMinorUnits,
} from '../services/payments.service';

type AuthedRequest = Request & { user?: { userId: string } };

const DEFAULT_WALLET_PAGE_SIZE = 20;
const MAX_WALLET_PAGE_SIZE = 100;

const parsePagination = (query: Request['query']) => {
  const page = Math.max(parseInt(String(query.page || '1'), 10), 1);
  const limit = Math.min(
    Math.max(parseInt(String(query.limit || String(DEFAULT_WALLET_PAGE_SIZE)), 10), 1),
    MAX_WALLET_PAGE_SIZE,
  );
  return { page, limit, skip: (page - 1) * limit };
};

/**
 * POST /payments/accounts
 * Creates the caller's payment account for a currency (provider derived from
 * it) or returns the existing one.
 */
export const createPaymentAccount = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const currency = (req.body.currency as string).toUpperCase();

    const existing = await prisma.paymentAccount.findUnique({ where: { userId } });
    if (existing) {
      return res
        .status(200)
        .json({ message: 'Successful', data: { account: serializeAccount(existing) } });
    }

    const account = await prisma.paymentAccount.create({
      data: { userId, currency, provider: providerForCurrency(currency) },
    });
    return res
      .status(201)
      .json({ message: 'Payment account created', data: { account: serializeAccount(account) } });
  } catch (error) {
    console.error('createPaymentAccount error:', error);
    return res.status(500).json({ error: 'Failed to create payment account' });
  }
};

/**
 * POST /payments/accounts/onboarding
 * Responder payout setup. Stripe: returns a hosted onboarding link (creating
 * the Express account on first call). Paystack: validates bank details and
 * creates the payout subaccount immediately.
 */
export const startOnboarding = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const account = await prisma.paymentAccount.findUnique({ where: { userId } });
    if (!account) {
      return res.status(404).json({ error: 'Payment account not found' });
    }

    const driver = getPaymentProvider(account.provider);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (account.provider === 'STRIPE') {
      let connectedAccountId = account.connectedAccountId;
      if (!connectedAccountId) {
        const created = await driver.createConnectedAccount({
          email: user!.email,
          country: req.body.country ?? 'US',
        });
        connectedAccountId = created.connectedAccountId;
        await prisma.paymentAccount.update({
          where: { id: account.id },
          data: { connectedAccountId, status: 'ONBOARDING' },
        });
      }

      const base = process.env.FRONTEND_URL ?? 'http://localhost:8081';
      const { url } = await driver.createOnboardingLink!({
        connectedAccountId,
        refreshUrl: `${base}/wallet/onboarding`,
        returnUrl: `${base}/wallet`,
      });
      const updated = await prisma.paymentAccount.findUnique({ where: { id: account.id } });
      return res.status(200).json({
        message: 'Successful',
        data: { account: serializeAccount(updated!), onboardingUrl: url },
      });
    }

    const { bankCode, accountNumber } = req.body;
    if (!bankCode || !accountNumber) {
      return res
        .status(400)
        .json({ error: 'bankCode and accountNumber are required for Paystack onboarding' });
    }

    const { accountName } = await driver.resolveBankAccount!({ accountNumber, bankCode });
    const feePercent = await getPlatformFeePercent();
    const created = await driver.createConnectedAccount({
      email: user!.email,
      businessName: user!.name,
      bankCode,
      accountNumber,
      percentageCharge: 100 - feePercent,
    });
    const updated = await prisma.paymentAccount.update({
      where: { id: account.id },
      data: {
        connectedAccountId: created.connectedAccountId,
        status: 'ACTIVE',
        payoutsEnabled: true,
      },
    });
    return res.status(200).json({
      message: 'Successful',
      data: { account: serializeAccount(updated), accountName },
    });
  } catch (error) {
    console.error('startOnboarding error:', error);
    return res.status(500).json({ error: 'Failed to start payout onboarding' });
  }
};

/**
 * GET /payments/accounts/status
 * Returns the caller's account (null when not created). Stripe connected
 * accounts are refreshed against the provider so completed onboarding flips
 * the account to ACTIVE.
 */
export const getAccountStatus = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const account = await prisma.paymentAccount.findUnique({ where: { userId } });
    if (!account) {
      return res.status(200).json({ message: 'Successful', data: { account: null } });
    }

    if (account.provider === 'STRIPE' && account.connectedAccountId) {
      const providerStatus = await getPaymentProvider(
        account.provider,
      ).getConnectedAccountStatus(account.connectedAccountId);
      const updated = await prisma.paymentAccount.update({
        where: { id: account.id },
        data: {
          payoutsEnabled: providerStatus.payoutsEnabled,
          status: providerStatus.payoutsEnabled ? 'ACTIVE' : account.status,
        },
      });
      return res
        .status(200)
        .json({ message: 'Successful', data: { account: serializeAccount(updated) } });
    }

    return res
      .status(200)
      .json({ message: 'Successful', data: { account: serializeAccount(account) } });
  } catch (error) {
    console.error('getAccountStatus error:', error);
    return res.status(500).json({ error: 'Failed to fetch payment account status' });
  }
};

/**
 * GET /payments/banks
 * Bank directory for the Paystack payout setup form.
 */
export const listBanks = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const account = await prisma.paymentAccount.findUnique({ where: { userId } });
    if (!account) {
      return res.status(404).json({ error: 'Payment account not found' });
    }
    if (account.provider !== 'PAYSTACK') {
      return res
        .status(400)
        .json({ error: 'Bank listing is only available for Paystack accounts' });
    }

    const banks = await getPaymentProvider(account.provider).listBanks!();
    return res.status(200).json({ message: 'Successful', data: { banks } });
  } catch (error) {
    console.error('listBanks error:', error);
    return res.status(500).json({ error: 'Failed to list banks' });
  }
};

/**
 * POST /payments/pay
 * Questioner initiates payment of the question price to the responder of an
 * ACCEPTED request. Returns the provider payload the client needs to confirm
 * the charge (Stripe PaymentSheet secrets / Paystack checkout URL).
 */
export const payForRequest = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { answerRequestId } = req.body;

    const answerRequest = await prisma.answerRequest.findUnique({
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

    const payeeAccount = await prisma.paymentAccount.findUnique({
      where: { userId: answerRequest.responderId },
    });
    if (!payeeAccount || !payeeAccount.payoutsEnabled || !payeeAccount.connectedAccountId) {
      return res.status(409).json({ error: 'The responder cannot receive payments yet' });
    }

    if (answerRequest.question.price <= 0) {
      return res.status(400).json({ error: 'Question has no payable amount' });
    }

    let payerAccount = await prisma.paymentAccount.findUnique({ where: { userId } });
    if (!payerAccount) {
      payerAccount = await prisma.paymentAccount.create({
        data: { userId, provider: payeeAccount.provider, currency: payeeAccount.currency },
      });
    }
    if (
      payerAccount.currency !== payeeAccount.currency ||
      payerAccount.provider !== payeeAccount.provider
    ) {
      return res.status(409).json({
        error: 'Your payment account currency does not match the responder payout currency',
      });
    }

    const existing = await prisma.transaction.findUnique({
      where: { answerRequestId: answerRequest.id },
    });
    if (existing?.status === 'SUCCEEDED') {
      return res.status(409).json({ error: 'This request has already been paid' });
    }

    const driver = getPaymentProvider(payeeAccount.provider);
    const payer = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    const customerId = await ensurePayerCustomer({
      account: payerAccount,
      user: payer!,
      driver,
    });

    const amountMinor = toMinorUnits(answerRequest.question.price);
    const platformFeeMinor = computePlatformFeeMinor(
      amountMinor,
      await getPlatformFeePercent(),
    );
    const charge = await driver.createCharge({
      amountMinor,
      currency: payeeAccount.currency,
      payerEmail: payer!.email,
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
      type: 'QUESTION_PAYMENT' as const,
      status: 'PENDING' as const,
      amount: answerRequest.question.price,
      currency: payeeAccount.currency,
      platformFee: fromMinorUnits(platformFeeMinor),
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
      ? await prisma.transaction.update({ where: { id: existing.id }, data })
      : await prisma.transaction.create({ data });

    return res.status(201).json({
      message: 'Payment initiated',
      data: {
        transaction: serializeTransaction(transaction),
        ...(charge.stripe ? { stripe: charge.stripe } : {}),
        ...(charge.paystack ? { paystack: charge.paystack } : {}),
      },
    });
  } catch (error) {
    console.error('payForRequest error:', error);
    return res.status(500).json({ error: 'Failed to initiate payment' });
  }
};

/**
 * POST /payments/pay/verify
 * Client fallback to the webhooks: re-checks a charge with the provider and
 * finalizes the transaction (idempotent).
 */
export const verifyPayment = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { transactionId } = req.body;

    const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (transaction.payerId !== userId && transaction.payeeId !== userId) {
      return res.status(403).json({ error: 'Not a participant in this transaction' });
    }
    if (transaction.status !== 'PENDING') {
      return res
        .status(200)
        .json({ message: 'Successful', data: { transaction: serializeTransaction(transaction) } });
    }

    const driver = getPaymentProvider(transaction.provider);
    const outcome = await driver.retrieveCharge(transaction.providerRef!);
    const updated =
      outcome.status === 'pending'
        ? transaction
        : await finalizeChargeOutcome({
            providerRef: transaction.providerRef!,
            outcome: { status: outcome.status, failureReason: outcome.failureReason },
          });

    return res.status(200).json({
      message: 'Successful',
      data: { transaction: serializeTransaction(updated ?? transaction) },
    });
  } catch (error) {
    console.error('verifyPayment error:', error);
    return res.status(500).json({ error: 'Failed to verify payment' });
  }
};

/**
 * GET /payments/wallet
 * Dashboard: net earnings, spend and answered-question counts per currency,
 * plus the paginated transaction list with counterparties and questions.
 */
export const getWallet = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { page, limit, skip } = parsePagination(req.query);

    const [earnedGroups, spentGroups, total, rows] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['currency'],
        where: { payeeId: userId, status: 'SUCCEEDED' },
        _sum: { amount: true, platformFee: true },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ['currency'],
        where: { payerId: userId, status: 'SUCCEEDED' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.transaction.count({
        where: { OR: [{ payerId: userId }, { payeeId: userId }] },
      }),
      prisma.transaction.findMany({
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
      amount: roundToTwo(group._sum.amount! - group._sum.platformFee!),
      count: group._count._all,
    }));
    const spent = spentGroups.map((group) => ({
      currency: group.currency,
      amount: roundToTwo(group._sum.amount!),
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
        direction: isPayee ? ('earned' as const) : ('spent' as const),
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
  } catch (error) {
    console.error('getWallet error:', error);
    return res.status(500).json({ error: 'Failed to fetch wallet' });
  }
};
