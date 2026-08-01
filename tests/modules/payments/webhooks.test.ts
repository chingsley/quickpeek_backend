import crypto from 'crypto';
import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/core/database/prisma/client';
import { clearDatabase, createAuthUser } from '../../helpers';

const STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
const PAYSTACK_SECRET = 'sk_test_paystack_webhook';

const stripeSignatureHeader = (payload: string): string => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
};

const paystackSignatureHeader = (payload: string): string =>
  crypto.createHmac('sha512', PAYSTACK_SECRET).update(payload).digest('hex');

let categoryId: string;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_webhook_key';
  process.env.STRIPE_WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET;
  process.env.PAYSTACK_SECRET_KEY = PAYSTACK_SECRET;

  await clearDatabase();
  categoryId = (
    await prisma.category.upsert({
      where: { slug: 'webhooks' },
      create: { name: 'webhooks', slug: 'webhooks' },
      update: {},
    })
  ).id;
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const setupPendingPayment = async (overrides: any = {}) => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const payer = await createAuthUser({ email: `p_${suffix}@wh.dev`, username: `p_${suffix}` });
  const payee = await createAuthUser({ email: `r_${suffix}@wh.dev`, username: `r_${suffix}` });
  const question = await prisma.question.create({
    data: {
      title: 'Webhook question',
      detail: 'Detail body here',
      categoryId,
      price: 30,
      acceptanceCriteria: 'Reasonable criteria',
      userId: payer.id,
    },
  });
  const answerRequest = await prisma.answerRequest.create({
    data: {
      questionId: question.id,
      responderId: payee.id,
      questionerId: payer.id,
      status: 'ACCEPTED',
    },
  });
  const providerRef = overrides.providerRef ?? `pi_${suffix}`;
  const transaction = await prisma.transaction.create({
    data: {
      provider: overrides.provider ?? 'STRIPE',
      type: 'QUESTION_PAYMENT',
      status: 'PENDING',
      amount: 30,
      currency: overrides.currency ?? 'USD',
      payerId: payer.id,
      payeeId: payee.id,
      questionId: question.id,
      answerRequestId: answerRequest.id,
      providerRef,
    },
  });
  return { payer, payee, question, answerRequest, transaction, providerRef };
};

const postStripeWebhook = (payload: object, signature?: string) => {
  const raw = JSON.stringify(payload);
  return request(app)
    .post('/api/v1/payments/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', signature ?? stripeSignatureHeader(raw))
    .send(raw);
};

const postPaystackWebhook = (payload: object, signature?: string) => {
  const raw = JSON.stringify(payload);
  return request(app)
    .post('/api/v1/payments/webhooks/paystack')
    .set('Content-Type', 'application/json')
    .set('x-paystack-signature', signature ?? paystackSignatureHeader(raw))
    .send(raw);
};

describe('POST /api/v1/payments/webhooks/stripe', () => {
  it('finalizes a succeeded payment intent and posts the chat confirmation', async () => {
    const { transaction, providerRef, answerRequest } = await setupPendingPayment();
    const res = await postStripeWebhook({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: providerRef, object: 'payment_intent' } },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const updated = await prisma.transaction.findUnique({ where: { id: transaction.id } });
    expect(updated?.status).toBe('SUCCEEDED');

    const confirmation = await prisma.message.findFirst({
      where: {
        answerRequestId: answerRequest.id,
        type: 'SYSTEM',
        text: { contains: 'Payment of USD 30.00 received.' },
      },
    });
    expect(confirmation).not.toBeNull();
  });

  it('is idempotent across duplicate deliveries', async () => {
    const { transaction, providerRef, answerRequest } = await setupPendingPayment();
    const event = {
      id: 'evt_dup',
      type: 'payment_intent.succeeded',
      data: { object: { id: providerRef, object: 'payment_intent' } },
    };
    await postStripeWebhook(event);
    const res = await postStripeWebhook(event);
    expect(res.status).toBe(200);

    const updated = await prisma.transaction.findUnique({ where: { id: transaction.id } });
    expect(updated?.status).toBe('SUCCEEDED');
    const confirmations = await prisma.message.count({
      where: { answerRequestId: answerRequest.id, type: 'SYSTEM', text: { contains: 'Payment of' } },
    });
    expect(confirmations).toBe(1);
  });

  it('finalizes a failed payment intent with the failure reason', async () => {
    const { transaction, providerRef } = await setupPendingPayment();
    const res = await postStripeWebhook({
      id: 'evt_2',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: providerRef,
          object: 'payment_intent',
          last_payment_error: { message: 'Your card was declined.' },
        },
      },
    });

    expect(res.status).toBe(200);
    const updated = await prisma.transaction.findUnique({ where: { id: transaction.id } });
    expect(updated).toMatchObject({ status: 'FAILED', failureReason: 'Your card was declined.' });
  });

  it('marks the connected account ACTIVE on account.updated with payouts enabled', async () => {
    const { payee } = await setupPendingPayment();
    await prisma.paymentAccount.create({
      data: {
        userId: payee.id,
        provider: 'STRIPE',
        currency: 'USD',
        status: 'ONBOARDING',
        connectedAccountId: 'acct_wh_1',
      },
    });

    const res = await postStripeWebhook({
      id: 'evt_3',
      type: 'account.updated',
      data: { object: { id: 'acct_wh_1', object: 'account', payouts_enabled: true } },
    });

    expect(res.status).toBe(200);
    const account = await prisma.paymentAccount.findUnique({ where: { userId: payee.id } });
    expect(account).toMatchObject({ status: 'ACTIVE', payoutsEnabled: true });
  });

  it('keeps the account non-active on account.updated with payouts disabled', async () => {
    const { payee } = await setupPendingPayment();
    await prisma.paymentAccount.create({
      data: {
        userId: payee.id,
        provider: 'STRIPE',
        currency: 'USD',
        status: 'ONBOARDING',
        connectedAccountId: 'acct_wh_2',
      },
    });

    await postStripeWebhook({
      id: 'evt_4',
      type: 'account.updated',
      data: { object: { id: 'acct_wh_2', object: 'account', payouts_enabled: false } },
    });

    const account = await prisma.paymentAccount.findUnique({ where: { userId: payee.id } });
    expect(account).toMatchObject({ status: 'ONBOARDING', payoutsEnabled: false });
  });

  it('acknowledges unknown events and unknown payment refs', async () => {
    const unknownType = await postStripeWebhook({
      id: 'evt_5',
      type: 'customer.created',
      data: { object: { id: 'cus_x', object: 'customer' } },
    });
    expect(unknownType.status).toBe(200);

    const unknownRef = await postStripeWebhook({
      id: 'evt_6',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_unknown', object: 'payment_intent' } },
    });
    expect(unknownRef.status).toBe(200);
  });

  it('rejects an invalid signature with 400', async () => {
    const res = await postStripeWebhook(
      { id: 'evt_7', type: 'payment_intent.succeeded', data: { object: { id: 'pi_x' } } },
      't=1,v1=forged',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature/i);
  });

  it('returns 500 when processing fails', async () => {
    const { providerRef } = await setupPendingPayment();
    jest.spyOn(prisma.transaction, 'findUnique').mockRejectedValueOnce(new Error('db down'));
    const res = await postStripeWebhook({
      id: 'evt_8',
      type: 'payment_intent.succeeded',
      data: { object: { id: providerRef, object: 'payment_intent' } },
    });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/v1/payments/webhooks/paystack', () => {
  it('finalizes a charge.success event', async () => {
    const reference = `ref_${Math.random().toString(36).slice(2, 10)}`;
    const { transaction, answerRequest } = await setupPendingPayment({
      provider: 'PAYSTACK',
      currency: 'NGN',
      providerRef: reference,
    });

    const res = await postPaystackWebhook({
      event: 'charge.success',
      data: { reference, status: 'success' },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    const updated = await prisma.transaction.findUnique({ where: { id: transaction.id } });
    expect(updated?.status).toBe('SUCCEEDED');
    const confirmation = await prisma.message.findFirst({
      where: {
        answerRequestId: answerRequest.id,
        type: 'SYSTEM',
        text: { contains: 'Payment of NGN 30.00 received.' },
      },
    });
    expect(confirmation).not.toBeNull();
  });

  it('acknowledges unknown event types', async () => {
    const res = await postPaystackWebhook({ event: 'transfer.success', data: {} });
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature with 400', async () => {
    const res = await postPaystackWebhook({ event: 'charge.success', data: {} }, 'forged');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature/i);
  });

  it('returns 500 when processing fails', async () => {
    const reference = `ref_${Math.random().toString(36).slice(2, 10)}`;
    await setupPendingPayment({ provider: 'PAYSTACK', currency: 'NGN', providerRef: reference });
    jest.spyOn(prisma.transaction, 'findUnique').mockRejectedValueOnce(new Error('db down'));
    const res = await postPaystackWebhook({
      event: 'charge.success',
      data: { reference, status: 'success' },
    });
    expect(res.status).toBe(500);
  });
});
