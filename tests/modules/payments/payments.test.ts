import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/core/database/prisma/client';
import { clearDatabase, createAuthUser } from '../../helpers';
import { setMarketConfigValue } from '../../../src/modules/config/configService';

jest.mock('../../../src/modules/payments/providers', () => ({
  getPaymentProvider: jest.fn(),
}));

import { getPaymentProvider } from '../../../src/modules/payments/providers';

const mockGetPaymentProvider = getPaymentProvider as jest.Mock;

const driver = {
  provider: 'STRIPE',
  createCustomer: jest.fn(),
  createConnectedAccount: jest.fn(),
  createOnboardingLink: jest.fn(),
  getConnectedAccountStatus: jest.fn(),
  createCharge: jest.fn(),
  retrieveCharge: jest.fn(),
  parseWebhook: jest.fn(),
  listBanks: jest.fn(),
  resolveBankAccount: jest.fn(),
};

type AuthUser = { id: string; email: string; username: string; token: string };

let questioner: AuthUser;
let responder: AuthUser;
let outsider: AuthUser;
let categoryId: string;

const buildQuestion = async (userId: string, overrides: any = {}) =>
  prisma.question.create({
    data: {
      title: overrides.title ?? 'Payable question',
      detail: overrides.detail ?? 'Detail body here',
      categoryId,
      price: overrides.price ?? 25,
      acceptanceCriteria: overrides.acceptanceCriteria ?? 'Reasonable criteria',
      userId,
      status: overrides.status ?? 'OPEN',
    },
  });

const buildRequest = async (
  questionId: string,
  responderId: string,
  questionerId: string,
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CLOSED_ANSWERED' = 'ACCEPTED',
) =>
  prisma.answerRequest.create({
    data: { questionId, responderId, questionerId, status },
  });

const buildPaymentAccount = async (userId: string, overrides: any = {}) =>
  prisma.paymentAccount.create({
    data: {
      userId,
      provider: overrides.provider ?? 'STRIPE',
      currency: overrides.currency ?? 'USD',
      status: overrides.status ?? 'ACTIVE',
      payoutsEnabled: overrides.payoutsEnabled ?? true,
      connectedAccountId:
        overrides.connectedAccountId === undefined ? 'acct_r' : overrides.connectedAccountId,
      customerId: overrides.customerId ?? null,
    },
  });

beforeAll(async () => {
  await clearDatabase();
  categoryId = (
    await prisma.category.upsert({
      where: { slug: 'general' },
      create: { name: 'general', slug: 'general' },
      update: {},
    })
  ).id;
  questioner = await createAuthUser({ email: 'q@pay.dev', username: 'pay_q' });
  responder = await createAuthUser({ email: 'r@pay.dev', username: 'pay_r' });
  outsider = await createAuthUser({ email: 'o@pay.dev', username: 'pay_o' });
});

beforeEach(() => {
  jest.resetAllMocks();
  mockGetPaymentProvider.mockReturnValue(driver);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await setMarketConfigValue('platformFeePercent', 0);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/v1/payments/accounts', () => {
  it('rejects unauthenticated callers', async () => {
    const res = await request(app).post('/api/v1/payments/accounts').send({ currency: 'USD' });
    expect(res.status).toBe(401);
  });

  it('validates the currency', async () => {
    for (const body of [{}, { currency: 'US' }, { currency: 12 }]) {
      const res = await request(app)
        .post('/api/v1/payments/accounts')
        .set('Authorization', `Bearer ${questioner.token}`)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  it('creates a STRIPE account for USD', async () => {
    const user = await createAuthUser({ email: 's1@pay.dev', username: 's1' });
    const res = await request(app)
      .post('/api/v1/payments/accounts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currency: 'usd' });
    expect(res.status).toBe(201);
    expect(res.body.data.account).toMatchObject({
      provider: 'STRIPE',
      currency: 'USD',
      status: 'PENDING',
      payoutsEnabled: false,
      customerId: null,
      connectedAccountId: null,
    });
  });

  it('creates a PAYSTACK account for NGN and returns the existing one on repeat', async () => {
    const user = await createAuthUser({ email: 's2@pay.dev', username: 's2' });
    const first = await request(app)
      .post('/api/v1/payments/accounts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currency: 'NGN' });
    expect(first.status).toBe(201);
    expect(first.body.data.account.provider).toBe('PAYSTACK');

    const second = await request(app)
      .post('/api/v1/payments/accounts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currency: 'NGN' });
    expect(second.status).toBe(200);
    expect(second.body.data.account.id).toBe(first.body.data.account.id);
  });

  it('returns 500 on database failure', async () => {
    jest.spyOn(prisma.paymentAccount, 'findUnique').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app)
      .post('/api/v1/payments/accounts')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ currency: 'USD' });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/v1/payments/accounts/onboarding', () => {
  it('rejects unauthenticated callers', async () => {
    const res = await request(app).post('/api/v1/payments/accounts/onboarding').send({});
    expect(res.status).toBe(401);
  });

  it('404s when the user has no payment account', async () => {
    const user = await createAuthUser({ email: 's3@pay.dev', username: 's3' });
    const res = await request(app)
      .post('/api/v1/payments/accounts/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it('creates a Stripe connected account and returns the onboarding URL', async () => {
    const user = await createAuthUser({ email: 's4@pay.dev', username: 's4' });
    await buildPaymentAccount(user.id, {
      status: 'PENDING',
      payoutsEnabled: false,
      connectedAccountId: null,
    });
    driver.createConnectedAccount.mockResolvedValue({ connectedAccountId: 'acct_new' });
    driver.createOnboardingLink.mockResolvedValue({ url: 'https://stripe.test/onboard' });

    const res = await request(app)
      .post('/api/v1/payments/accounts/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.onboardingUrl).toBe('https://stripe.test/onboard');
    expect(driver.createConnectedAccount).toHaveBeenCalledWith(
      expect.objectContaining({ email: 's4@pay.dev', country: 'US' }),
    );
    expect(driver.createOnboardingLink).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountId: 'acct_new' }),
    );
    const account = await prisma.paymentAccount.findUnique({ where: { userId: user.id } });
    expect(account).toMatchObject({ connectedAccountId: 'acct_new', status: 'ONBOARDING' });
  });

  it('reuses the connected account on subsequent onboarding attempts', async () => {
    const user = await createAuthUser({ email: 's5@pay.dev', username: 's5' });
    await buildPaymentAccount(user.id, {
      status: 'ONBOARDING',
      payoutsEnabled: false,
      connectedAccountId: 'acct_existing',
    });
    driver.createOnboardingLink.mockResolvedValue({ url: 'https://stripe.test/again' });

    const res = await request(app)
      .post('/api/v1/payments/accounts/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ country: 'GB' });

    expect(res.status).toBe(200);
    expect(res.body.data.onboardingUrl).toBe('https://stripe.test/again');
    expect(driver.createConnectedAccount).not.toHaveBeenCalled();
  });

  it('passes an explicit country when creating the connected account', async () => {
    const user = await createAuthUser({ email: 's5b@pay.dev', username: 's5b' });
    await buildPaymentAccount(user.id, {
      status: 'PENDING',
      payoutsEnabled: false,
      connectedAccountId: null,
    });
    driver.createConnectedAccount.mockResolvedValue({ connectedAccountId: 'acct_gb' });
    driver.createOnboardingLink.mockResolvedValue({ url: 'https://stripe.test/gb' });

    const res = await request(app)
      .post('/api/v1/payments/accounts/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ country: 'GB' });

    expect(res.status).toBe(200);
    expect(driver.createConnectedAccount).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'GB' }),
    );
  });

  it('falls back to default onboarding URLs when FRONTEND_URL is unset', async () => {
    const user = await createAuthUser({ email: 's5c@pay.dev', username: 's5c' });
    await buildPaymentAccount(user.id, {
      status: 'ONBOARDING',
      payoutsEnabled: false,
      connectedAccountId: 'acct_default_url',
    });
    driver.createOnboardingLink.mockResolvedValue({ url: 'https://stripe.test/default' });

    const saved = process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URL;
    try {
      const res = await request(app)
        .post('/api/v1/payments/accounts/onboarding')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});
      expect(res.status).toBe(200);
      expect(driver.createOnboardingLink).toHaveBeenCalledWith({
        connectedAccountId: 'acct_default_url',
        refreshUrl: 'http://localhost:8081/wallet/onboarding',
        returnUrl: 'http://localhost:8081/wallet',
      });
    } finally {
      process.env.FRONTEND_URL = saved;
    }
  });

  it('falls back to the default when FRONTEND_URL is empty', async () => {
    const user = await createAuthUser({ email: 's5d@pay.dev', username: 's5d' });
    await buildPaymentAccount(user.id, {
      status: 'ONBOARDING',
      payoutsEnabled: false,
      connectedAccountId: 'acct_empty_url',
    });
    driver.createOnboardingLink.mockResolvedValue({ url: 'https://stripe.test/empty' });

    const saved = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = '';
    try {
      const res = await request(app)
        .post('/api/v1/payments/accounts/onboarding')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});
      expect(res.status).toBe(200);
      expect(driver.createOnboardingLink).toHaveBeenCalledWith({
        connectedAccountId: 'acct_empty_url',
        refreshUrl: 'http://localhost:8081/wallet/onboarding',
        returnUrl: 'http://localhost:8081/wallet',
      });
    } finally {
      process.env.FRONTEND_URL = saved;
    }
  });

  it('uses a fully-qualified FRONTEND_URL unchanged', async () => {
    const user = await createAuthUser({ email: 's5f@pay.dev', username: 's5f' });
    await buildPaymentAccount(user.id, {
      status: 'ONBOARDING',
      payoutsEnabled: false,
      connectedAccountId: 'acct_fq_url',
    });
    driver.createOnboardingLink.mockResolvedValue({ url: 'https://stripe.test/fq' });

    const saved = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.quickpeek.example.com';
    try {
      const res = await request(app)
        .post('/api/v1/payments/accounts/onboarding')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});
      expect(res.status).toBe(200);
      expect(driver.createOnboardingLink).toHaveBeenCalledWith({
        connectedAccountId: 'acct_fq_url',
        refreshUrl: 'https://app.quickpeek.example.com/wallet/onboarding',
        returnUrl: 'https://app.quickpeek.example.com/wallet',
      });
    } finally {
      process.env.FRONTEND_URL = saved;
    }
  });

  it('prefixes the scheme when FRONTEND_URL lacks one', async () => {
    const user = await createAuthUser({ email: 's5e@pay.dev', username: 's5e' });
    await buildPaymentAccount(user.id, {
      status: 'ONBOARDING',
      payoutsEnabled: false,
      connectedAccountId: 'acct_schemeless',
    });
    driver.createOnboardingLink.mockResolvedValue({ url: 'https://stripe.test/scheme' });

    const saved = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'pwiksxm-chingsley-8081.exp.direct';
    try {
      const res = await request(app)
        .post('/api/v1/payments/accounts/onboarding')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});
      expect(res.status).toBe(200);
      expect(driver.createOnboardingLink).toHaveBeenCalledWith({
        connectedAccountId: 'acct_schemeless',
        refreshUrl: 'https://pwiksxm-chingsley-8081.exp.direct/wallet/onboarding',
        returnUrl: 'https://pwiksxm-chingsley-8081.exp.direct/wallet',
      });
    } finally {
      process.env.FRONTEND_URL = saved;
    }
  });

  it('wraps the client deep link in an https return-page URL', async () => {
    const user = await createAuthUser({ email: 's5g@pay.dev', username: 's5g' });
    await buildPaymentAccount(user.id, {
      status: 'ONBOARDING',
      payoutsEnabled: false,
      connectedAccountId: 'acct_deeplink',
    });
    driver.createOnboardingLink.mockResolvedValue({ url: 'https://stripe.test/deeplink' });

    const res = await request(app)
      .post('/api/v1/payments/accounts/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .set('x-forwarded-host', 'pwiksxm-chingsley-8081.exp.direct')
      .set('x-forwarded-proto', 'https')
      .send({
        returnUrl: 'quickpeekfrontend://wallet/onboarding',
        refreshUrl: 'quickpeekfrontend://wallet/onboarding',
      });

    expect(res.status).toBe(200);
    const expectedTarget = encodeURIComponent('quickpeekfrontend://wallet/onboarding');
    expect(driver.createOnboardingLink).toHaveBeenCalledWith({
      connectedAccountId: 'acct_deeplink',
      refreshUrl: `https://pwiksxm-chingsley-8081.exp.direct/api/v1/payments/onboarding/return?to=${expectedTarget}`,
      returnUrl: `https://pwiksxm-chingsley-8081.exp.direct/api/v1/payments/onboarding/return?to=${expectedTarget}`,
    });
  });

  it('rejects malformed or unsafe redirect URLs', async () => {
    const user = await createAuthUser({ email: 's5h@pay.dev', username: 's5h' });
    await buildPaymentAccount(user.id, {
      status: 'ONBOARDING',
      payoutsEnabled: false,
      connectedAccountId: 'acct_badurl',
    });

    for (const body of [
      { returnUrl: 'not a url' },
      { refreshUrl: 'javascript:alert(1)' },
      { returnUrl: 'file:///etc/passwd' },
    ]) {
      const res = await request(app)
        .post('/api/v1/payments/accounts/onboarding')
        .set('Authorization', `Bearer ${user.token}`)
        .send(body);
      expect(res.status).toBe(400);
    }
    expect(driver.createOnboardingLink).not.toHaveBeenCalled();
  });

  it('falls back when a client redirect URL has no host', async () => {
    const user = await createAuthUser({ email: 's5i@pay.dev', username: 's5i' });
    await buildPaymentAccount(user.id, {
      status: 'ONBOARDING',
      payoutsEnabled: false,
      connectedAccountId: 'acct_hostless',
    });
    driver.createOnboardingLink.mockResolvedValue({ url: 'https://stripe.test/hostless' });

    const res = await request(app)
      .post('/api/v1/payments/accounts/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        returnUrl: 'quickpeekfrontend:///wallet/onboarding',
        refreshUrl: 'exp:///--/wallet/onboarding',
      });

    expect(res.status).toBe(200);
    expect(driver.createOnboardingLink).toHaveBeenCalledWith({
      connectedAccountId: 'acct_hostless',
      refreshUrl: 'http://localhost:8081/wallet/onboarding',
      returnUrl: 'http://localhost:8081/wallet',
    });
  });

  it('onboards a Paystack responder with bank details', async () => {
    const user = await createAuthUser({ email: 's6@pay.dev', username: 's6' });
    await buildPaymentAccount(user.id, {
      provider: 'PAYSTACK',
      currency: 'NGN',
      status: 'PENDING',
      payoutsEnabled: false,
      connectedAccountId: null,
    });
    driver.resolveBankAccount.mockResolvedValue({ accountName: 'PAY RESPONDER' });
    driver.createConnectedAccount.mockResolvedValue({ connectedAccountId: 'ACCT_sub' });
    await setMarketConfigValue('platformFeePercent', 10);

    const res = await request(app)
      .post('/api/v1/payments/accounts/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bankCode: '058', accountNumber: '0123456789' });

    expect(res.status).toBe(200);
    expect(res.body.data.accountName).toBe('PAY RESPONDER');
    expect(driver.createConnectedAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        bankCode: '058',
        accountNumber: '0123456789',
        percentageCharge: 90,
      }),
    );
    const account = await prisma.paymentAccount.findUnique({ where: { userId: user.id } });
    expect(account).toMatchObject({
      connectedAccountId: 'ACCT_sub',
      status: 'ACTIVE',
      payoutsEnabled: true,
    });
  });

  it('requires bank details for Paystack onboarding', async () => {
    const user = await createAuthUser({ email: 's7@pay.dev', username: 's7' });
    await buildPaymentAccount(user.id, {
      provider: 'PAYSTACK',
      currency: 'NGN',
      status: 'PENDING',
      payoutsEnabled: false,
      connectedAccountId: null,
    });
    const res = await request(app)
      .post('/api/v1/payments/accounts/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ bankCode: '058' });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database failure', async () => {
    jest.spyOn(prisma.paymentAccount, 'findUnique').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app)
      .post('/api/v1/payments/accounts/onboarding')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({});
    expect(res.status).toBe(500);
  });
});

describe('GET /api/v1/payments/accounts/status', () => {
  it('returns null when there is no account', async () => {
    const user = await createAuthUser({ email: 's8@pay.dev', username: 's8' });
    const res = await request(app)
      .get('/api/v1/payments/accounts/status')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.account).toBeNull();
  });

  it('returns a Stripe account without a connected account untouched', async () => {
    const user = await createAuthUser({ email: 's9@pay.dev', username: 's9' });
    await buildPaymentAccount(user.id, {
      status: 'PENDING',
      payoutsEnabled: false,
      connectedAccountId: null,
    });
    const res = await request(app)
      .get('/api/v1/payments/accounts/status')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.account.status).toBe('PENDING');
    expect(driver.getConnectedAccountStatus).not.toHaveBeenCalled();
  });

  it('refreshes a Stripe connected account and activates it when payouts are enabled', async () => {
    const user = await createAuthUser({ email: 's10@pay.dev', username: 's10' });
    await buildPaymentAccount(user.id, {
      status: 'ONBOARDING',
      payoutsEnabled: false,
      connectedAccountId: 'acct_st',
    });
    driver.getConnectedAccountStatus.mockResolvedValue({
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });
    const res = await request(app)
      .get('/api/v1/payments/accounts/status')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.account).toMatchObject({ status: 'ACTIVE', payoutsEnabled: true });
  });

  it('keeps a Stripe account ONBOARDING while payouts are disabled', async () => {
    const user = await createAuthUser({ email: 's11@pay.dev', username: 's11' });
    await buildPaymentAccount(user.id, {
      status: 'ONBOARDING',
      payoutsEnabled: false,
      connectedAccountId: 'acct_st2',
    });
    driver.getConnectedAccountStatus.mockResolvedValue({
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    });
    const res = await request(app)
      .get('/api/v1/payments/accounts/status')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.body.data.account).toMatchObject({ status: 'ONBOARDING', payoutsEnabled: false });
  });

  it('returns a stored Paystack account without provider calls', async () => {
    const user = await createAuthUser({ email: 's12@pay.dev', username: 's12' });
    await buildPaymentAccount(user.id, { provider: 'PAYSTACK', currency: 'NGN' });
    const res = await request(app)
      .get('/api/v1/payments/accounts/status')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.account.provider).toBe('PAYSTACK');
    expect(driver.getConnectedAccountStatus).not.toHaveBeenCalled();
  });

  it('returns 500 on database failure', async () => {
    jest.spyOn(prisma.paymentAccount, 'findUnique').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app)
      .get('/api/v1/payments/accounts/status')
      .set('Authorization', `Bearer ${questioner.token}`);
    expect(res.status).toBe(500);
  });
});

describe('GET /api/v1/payments/banks', () => {
  it('404s without an account and 400s for non-Paystack accounts', async () => {
    const noAccount = await createAuthUser({ email: 's13@pay.dev', username: 's13' });
    const missing = await request(app)
      .get('/api/v1/payments/banks')
      .set('Authorization', `Bearer ${noAccount.token}`);
    expect(missing.status).toBe(404);

    const stripeUser = await createAuthUser({ email: 's14@pay.dev', username: 's14' });
    await buildPaymentAccount(stripeUser.id, {});
    const wrongProvider = await request(app)
      .get('/api/v1/payments/banks')
      .set('Authorization', `Bearer ${stripeUser.token}`);
    expect(wrongProvider.status).toBe(400);
  });

  it('lists banks for Paystack accounts', async () => {
    const user = await createAuthUser({ email: 's15@pay.dev', username: 's15' });
    await buildPaymentAccount(user.id, { provider: 'PAYSTACK', currency: 'NGN' });
    driver.listBanks.mockResolvedValue([{ name: 'GTBank', code: '058' }]);
    const res = await request(app)
      .get('/api/v1/payments/banks')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.banks).toEqual([{ name: 'GTBank', code: '058' }]);
  });

  it('returns 500 on database failure', async () => {
    jest.spyOn(prisma.paymentAccount, 'findUnique').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app)
      .get('/api/v1/payments/banks')
      .set('Authorization', `Bearer ${questioner.token}`);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/v1/payments/pay', () => {
  it('rejects unauthenticated callers and invalid bodies', async () => {
    const unauth = await request(app).post('/api/v1/payments/pay').send({});
    expect(unauth.status).toBe(401);
    const invalid = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ answerRequestId: 'not-a-uuid' });
    expect(invalid.status).toBe(400);
  });

  it('404s when the request does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ answerRequestId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('403s when the caller is not the questioner', async () => {
    const question = await buildQuestion(questioner.id);
    const reqRow = await buildRequest(question.id, responder.id, questioner.id);
    const res = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${responder.token}`)
      .send({ answerRequestId: reqRow.id });
    expect(res.status).toBe(403);
  });

  it('409s when the request is not ACCEPTED', async () => {
    const question = await buildQuestion(questioner.id);
    const reqRow = await buildRequest(question.id, responder.id, questioner.id, 'PENDING');
    const res = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ answerRequestId: reqRow.id });
    expect(res.status).toBe(409);
  });

  it('409s when the responder cannot receive payouts', async () => {
    const noAccountQ = await buildQuestion(questioner.id);
    const noAccountReq = await buildRequest(noAccountQ.id, responder.id, questioner.id);
    const missing = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ answerRequestId: noAccountReq.id });
    expect(missing.status).toBe(409);

    const notEnabled = await createAuthUser({ email: 's16@pay.dev', username: 's16' });
    await buildPaymentAccount(notEnabled.id, { payoutsEnabled: false, status: 'ONBOARDING' });
    const q2 = await buildQuestion(questioner.id);
    const req2 = await buildRequest(q2.id, notEnabled.id, questioner.id);
    const disabled = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ answerRequestId: req2.id });
    expect(disabled.status).toBe(409);
  });

  it('409s when payer and payee currencies differ', async () => {
    await buildPaymentAccount(questioner.id, { currency: 'USD' }).catch(() => {});
    const payee = await createAuthUser({ email: 's17@pay.dev', username: 's17' });
    await buildPaymentAccount(payee.id, { provider: 'PAYSTACK', currency: 'NGN' });
    const question = await buildQuestion(questioner.id);
    const reqRow = await buildRequest(question.id, payee.id, questioner.id);
    const res = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ answerRequestId: reqRow.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/currenc/i);
  });

  it('400s for free questions', async () => {
    const payee = await createAuthUser({ email: 's18@pay.dev', username: 's18' });
    await buildPaymentAccount(payee.id, {});
    const question = await buildQuestion(questioner.id, { price: 0 });
    const reqRow = await buildRequest(question.id, payee.id, questioner.id);
    const res = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ answerRequestId: reqRow.id });
    expect(res.status).toBe(400);
  });

  it('pays via Stripe: creates customer + charge and a PENDING transaction', async () => {
    const payer = await createAuthUser({ email: 's19@pay.dev', username: 's19' });
    const payee = await createAuthUser({ email: 's20@pay.dev', username: 's20' });
    await buildPaymentAccount(payee.id, { connectedAccountId: 'acct_payee' });
    const question = await buildQuestion(payer.id, { price: 25 });
    const reqRow = await buildRequest(question.id, payee.id, payer.id);

    driver.createCustomer.mockResolvedValue({ customerId: 'cus_payer' });
    driver.createCharge.mockResolvedValue({
      providerRef: 'pi_1',
      stripe: { clientSecret: 'pi_1_secret', customerId: 'cus_payer', ephemeralKey: 'ek_1' },
    });

    const res = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ answerRequestId: reqRow.id });

    expect(res.status).toBe(201);
    expect(res.body.data.stripe).toEqual({
      clientSecret: 'pi_1_secret',
      customerId: 'cus_payer',
      ephemeralKey: 'ek_1',
    });
    expect(res.body.data.transaction).toMatchObject({
      status: 'PENDING',
      amount: 25,
      currency: 'USD',
      platformFee: 0,
      payerId: payer.id,
      payeeId: payee.id,
      answerRequestId: reqRow.id,
      providerRef: 'pi_1',
    });

    // Payer account was auto-created and the customer persisted on it.
    const payerAccount = await prisma.paymentAccount.findUnique({ where: { userId: payer.id } });
    expect(payerAccount).toMatchObject({
      provider: 'STRIPE',
      currency: 'USD',
      customerId: 'cus_payer',
    });
    expect(driver.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 2500,
        currency: 'USD',
        customerId: 'cus_payer',
        connectedAccountId: 'acct_payee',
        platformFeeMinor: 0,
        idempotencyKey: reqRow.id,
        metadata: expect.objectContaining({ answerRequestId: reqRow.id }),
      }),
    );
  });

  it('applies the configured platform fee', async () => {
    await setMarketConfigValue('platformFeePercent', 10);
    const payer = await createAuthUser({ email: 's21@pay.dev', username: 's21' });
    const payee = await createAuthUser({ email: 's22@pay.dev', username: 's22' });
    await buildPaymentAccount(payee.id, {});
    const question = await buildQuestion(payer.id, { price: 40 });
    const reqRow = await buildRequest(question.id, payee.id, payer.id);

    driver.createCustomer.mockResolvedValue({ customerId: 'cus_21' });
    driver.createCharge.mockResolvedValue({
      providerRef: 'pi_fee',
      stripe: { clientSecret: 's', customerId: 'cus_21', ephemeralKey: 'e' },
    });

    const res = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ answerRequestId: reqRow.id });

    expect(res.status).toBe(201);
    expect(res.body.data.transaction.platformFee).toBeCloseTo(4);
    expect(driver.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 4000, platformFeeMinor: 400 }),
    );
  });

  it('resets a PENDING transaction on retry instead of duplicating it', async () => {
    const payer = await createAuthUser({ email: 's23@pay.dev', username: 's23' });
    const payee = await createAuthUser({ email: 's24@pay.dev', username: 's24' });
    await buildPaymentAccount(payee.id, {});
    const question = await buildQuestion(payer.id);
    const reqRow = await buildRequest(question.id, payee.id, payer.id);

    driver.createCustomer.mockResolvedValue({ customerId: 'cus_23' });
    driver.createCharge
      .mockResolvedValueOnce({
        providerRef: 'pi_first',
        stripe: { clientSecret: 's1', customerId: 'cus_23', ephemeralKey: 'e1' },
      })
      .mockResolvedValueOnce({
        providerRef: 'pi_second',
        stripe: { clientSecret: 's2', customerId: 'cus_23', ephemeralKey: 'e2' },
      });

    const first = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ answerRequestId: reqRow.id });
    const second = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ answerRequestId: reqRow.id });

    expect(second.status).toBe(201);
    expect(second.body.data.transaction.id).toBe(first.body.data.transaction.id);
    expect(second.body.data.transaction.providerRef).toBe('pi_second');
    const count = await prisma.transaction.count({ where: { answerRequestId: reqRow.id } });
    expect(count).toBe(1);
  });

  it('409s when the request has already been paid', async () => {
    const payer = await createAuthUser({ email: 's25@pay.dev', username: 's25' });
    const payee = await createAuthUser({ email: 's26@pay.dev', username: 's26' });
    await buildPaymentAccount(payee.id, {});
    const question = await buildQuestion(payer.id);
    const reqRow = await buildRequest(question.id, payee.id, payer.id);
    await prisma.transaction.create({
      data: {
        provider: 'STRIPE',
        type: 'QUESTION_PAYMENT',
        status: 'SUCCEEDED',
        amount: 25,
        currency: 'USD',
        payerId: payer.id,
        payeeId: payee.id,
        questionId: question.id,
        answerRequestId: reqRow.id,
        providerRef: 'pi_done',
      },
    });

    const res = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ answerRequestId: reqRow.id });
    expect(res.status).toBe(409);
  });

  it('pays via Paystack and returns the authorization URL', async () => {
    const payer = await createAuthUser({ email: 's27@pay.dev', username: 's27' });
    const payee = await createAuthUser({ email: 's28@pay.dev', username: 's28' });
    await buildPaymentAccount(payee.id, {
      provider: 'PAYSTACK',
      currency: 'NGN',
      connectedAccountId: 'ACCT_payee',
    });
    const question = await buildQuestion(payer.id, { price: 5000 });
    const reqRow = await buildRequest(question.id, payee.id, payer.id);

    driver.createCustomer.mockResolvedValue({ customerId: 'CUS_27' });
    driver.createCharge.mockResolvedValue({
      providerRef: 'ref_1',
      paystack: { authorizationUrl: 'https://paystack.test/pay/ref_1' },
    });

    const res = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ answerRequestId: reqRow.id });

    expect(res.status).toBe(201);
    expect(res.body.data.paystack).toEqual({
      authorizationUrl: 'https://paystack.test/pay/ref_1',
    });
    expect(res.body.data.transaction).toMatchObject({
      provider: 'PAYSTACK',
      currency: 'NGN',
      amount: 5000,
      providerRef: 'ref_1',
    });
    expect(driver.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 500000, currency: 'NGN' }),
    );
  });

  it('returns 500 on database failure', async () => {
    jest.spyOn(prisma.answerRequest, 'findUnique').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app)
      .post('/api/v1/payments/pay')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ answerRequestId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/v1/payments/pay/verify', () => {
  const setupPaid = async () => {
    const payer = await createAuthUser({ email: `v${Date.now()}${Math.random()}@pay.dev`, username: `v${Math.random().toString(36).slice(2, 9)}` });
    const payee = await createAuthUser({ email: `w${Math.random()}@pay.dev`, username: `w${Math.random().toString(36).slice(2, 9)}` });
    await buildPaymentAccount(payee.id, {});
    const question = await buildQuestion(payer.id);
    const reqRow = await buildRequest(question.id, payee.id, payer.id);
    const tx = await prisma.transaction.create({
      data: {
        provider: 'STRIPE',
        type: 'QUESTION_PAYMENT',
        status: 'PENDING',
        amount: 25,
        currency: 'USD',
        payerId: payer.id,
        payeeId: payee.id,
        questionId: question.id,
        answerRequestId: reqRow.id,
        providerRef: `pi_${Math.random().toString(36).slice(2)}`,
      },
    });
    return { payer, payee, question, reqRow, tx };
  };

  it('rejects unauthenticated callers and invalid bodies', async () => {
    const unauth = await request(app).post('/api/v1/payments/pay/verify').send({});
    expect(unauth.status).toBe(401);
    const invalid = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ transactionId: 'nope' });
    expect(invalid.status).toBe(400);
  });

  it('404s for unknown transactions and 403s for non-participants', async () => {
    const missing = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ transactionId: '00000000-0000-0000-0000-000000000000' });
    expect(missing.status).toBe(404);

    const { tx } = await setupPaid();
    const forbidden = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ transactionId: tx.id });
    expect(forbidden.status).toBe(403);
  });

  it('returns finalized transactions without calling the provider', async () => {
    const { payer, tx } = await setupPaid();
    await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'SUCCEEDED' } });
    const res = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ transactionId: tx.id });
    expect(res.status).toBe(200);
    expect(res.body.data.transaction.status).toBe('SUCCEEDED');
    expect(driver.retrieveCharge).not.toHaveBeenCalled();
  });

  it('keeps PENDING when the provider still reports pending', async () => {
    const { payer, tx } = await setupPaid();
    driver.retrieveCharge.mockResolvedValue({ status: 'pending', failureReason: null });
    const res = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ transactionId: tx.id });
    expect(res.status).toBe(200);
    expect(res.body.data.transaction.status).toBe('PENDING');
  });

  it('finalizes a successful charge exactly once (idempotent)', async () => {
    const { payer, payee, reqRow, tx } = await setupPaid();
    driver.retrieveCharge.mockResolvedValue({ status: 'succeeded', failureReason: null });

    const first = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ transactionId: tx.id });
    expect(first.body.data.transaction.status).toBe('SUCCEEDED');

    const second = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${payee.token}`)
      .send({ transactionId: tx.id });
    expect(second.body.data.transaction.status).toBe('SUCCEEDED');

    const systemMessages = await prisma.message.count({
      where: { answerRequestId: reqRow.id, type: 'SYSTEM', text: { contains: 'Payment of' } },
    });
    expect(systemMessages).toBe(1);
  });

  it('finalizes a failed charge with the failure reason', async () => {
    const { payer, reqRow, tx } = await setupPaid();
    driver.retrieveCharge.mockResolvedValue({ status: 'failed', failureReason: 'card declined' });
    const res = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ transactionId: tx.id });
    expect(res.body.data.transaction).toMatchObject({
      status: 'FAILED',
      failureReason: 'card declined',
    });
    const failureMessage = await prisma.message.findFirst({
      where: { answerRequestId: reqRow.id, type: 'SYSTEM', text: { contains: 'failed' } },
    });
    expect(failureMessage).not.toBeNull();
  });

  it('finalizes a failed charge without a reason', async () => {
    const { payer, reqRow, tx } = await setupPaid();
    driver.retrieveCharge.mockResolvedValue({ status: 'failed', failureReason: null });
    const res = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ transactionId: tx.id });
    expect(res.body.data.transaction).toMatchObject({ status: 'FAILED', failureReason: null });
    const failureMessage = await prisma.message.findFirst({
      where: { answerRequestId: reqRow.id, type: 'SYSTEM', text: { contains: 'failed.' } },
    });
    expect(failureMessage).not.toBeNull();
  });

  it('falls back to the loaded transaction when it disappears mid-verify', async () => {
    const { payer, tx } = await setupPaid();
    driver.retrieveCharge.mockResolvedValue({ status: 'succeeded', failureReason: null });
    const findUnique = jest.spyOn(prisma.transaction, 'findUnique');
    findUnique
      .mockResolvedValueOnce(tx) // controller load
      .mockResolvedValueOnce(null); // finalize lookup → gone

    const res = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${payer.token}`)
      .send({ transactionId: tx.id });
    expect(res.status).toBe(200);
    expect(res.body.data.transaction.id).toBe(tx.id);
  });

  it('returns 500 on database failure', async () => {
    jest.spyOn(prisma.transaction, 'findUnique').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app)
      .post('/api/v1/payments/pay/verify')
      .set('Authorization', `Bearer ${questioner.token}`)
      .send({ transactionId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(500);
  });
});

describe('GET /api/v1/payments/wallet', () => {
  it('rejects unauthenticated callers', async () => {
    const res = await request(app).get('/api/v1/payments/wallet');
    expect(res.status).toBe(401);
  });

  it('returns an empty wallet for new users', async () => {
    const user = await createAuthUser({ email: 's29@pay.dev', username: 's29' });
    const res = await request(app)
      .get('/api/v1/payments/wallet')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({ earned: [], spent: [], questionsAnswered: 0 });
    expect(res.body.data.transactions.items).toEqual([]);
    expect(res.body.data.transactions.pagination).toMatchObject({
      page: 1,
      total: 0,
      hasMore: false,
    });
  });

  it('summarizes earnings, spend and lists transactions with counterparties', async () => {
    const payer = await createAuthUser({ email: 's30@pay.dev', username: 's30' });
    const payee = await createAuthUser({ email: 's31@pay.dev', username: 's31' });
    const question = await buildQuestion(payer.id, { title: 'Funded question' });
    const reqRow = await buildRequest(question.id, payee.id, payer.id);

    const mkTx = (overrides: any = {}) =>
      prisma.transaction.create({
        data: {
          provider: 'STRIPE',
          type: 'QUESTION_PAYMENT',
          status: 'SUCCEEDED',
          amount: 25,
          currency: 'USD',
          platformFee: 2.5,
          payerId: payer.id,
          payeeId: payee.id,
          questionId: question.id,
          answerRequestId: reqRow.id,
          ...overrides,
        },
      });

    await mkTx({ answerRequestId: null, providerRef: 'pi_a' });
    await mkTx({ answerRequestId: reqRow.id, providerRef: 'pi_b' });
    await mkTx({
      status: 'FAILED',
      platformFee: 0,
      answerRequestId: null,
      providerRef: 'pi_c',
      failureReason: 'declined',
    });

    const payeeRes = await request(app)
      .get('/api/v1/payments/wallet')
      .set('Authorization', `Bearer ${payee.token}`);
    expect(payeeRes.status).toBe(200);
    // Net of platform fees: (25 - 2.5) * 2 succeeded = 45.
    expect(payeeRes.body.data.totals.earned).toEqual([{ currency: 'USD', amount: 45, count: 2 }]);
    expect(payeeRes.body.data.totals.questionsAnswered).toBe(2);

    const items = payeeRes.body.data.transactions.items;
    expect(items).toHaveLength(3);
    expect(items[0].direction).toBe('earned');
    expect(items[0].counterparty).toMatchObject({ id: payer.id, username: 's30' });
    const withQuestion = items.find((i: any) => i.question);
    expect(withQuestion.question).toMatchObject({ title: 'Funded question' });
    const failed = items.find((i: any) => i.status === 'FAILED');
    expect(failed.failureReason).toBe('declined');
    expect(items.every((i: any) => typeof i.createdAt === 'string')).toBe(true);

    const payerRes = await request(app)
      .get('/api/v1/payments/wallet')
      .set('Authorization', `Bearer ${payer.token}`);
    expect(payerRes.body.data.totals.spent).toEqual([{ currency: 'USD', amount: 50, count: 2 }]);
    expect(payerRes.body.data.totals.earned).toEqual([]);
    expect(payerRes.body.data.transactions.items[0].direction).toBe('spent');
    expect(payerRes.body.data.transactions.items[0].counterparty.username).toBe('s31');
  });

  it('paginates the transaction list', async () => {
    const payer = await createAuthUser({ email: 's32@pay.dev', username: 's32' });
    const payee = await createAuthUser({ email: 's33@pay.dev', username: 's33' });
    for (let i = 0; i < 3; i++) {
      await prisma.transaction.create({
        data: {
          provider: 'STRIPE',
          type: 'QUESTION_PAYMENT',
          status: 'SUCCEEDED',
          amount: 10,
          currency: 'USD',
          payerId: payer.id,
          payeeId: payee.id,
          providerRef: `pi_page_${i}`,
        },
      });
    }

    const page1 = await request(app)
      .get('/api/v1/payments/wallet?page=1&limit=2')
      .set('Authorization', `Bearer ${payee.token}`);
    expect(page1.body.data.transactions.items).toHaveLength(2);
    expect(page1.body.data.transactions.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      hasMore: true,
    });

    const page2 = await request(app)
      .get('/api/v1/payments/wallet?page=2&limit=2')
      .set('Authorization', `Bearer ${payee.token}`);
    expect(page2.body.data.transactions.items).toHaveLength(1);
    expect(page2.body.data.transactions.pagination.hasMore).toBe(false);
  });

  it('returns 500 on database failure', async () => {
    jest.spyOn(prisma.transaction, 'groupBy').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app)
      .get('/api/v1/payments/wallet')
      .set('Authorization', `Bearer ${questioner.token}`);
    expect(res.status).toBe(500);
  });
});

describe('GET /api/v1/payments/onboarding/return', () => {
  it('renders the handoff page with the deep link embedded and escaped', async () => {
    const res = await request(app).get(
      `/api/v1/payments/onboarding/return?to=${encodeURIComponent('quickpeekfrontend://wallet/onboarding?from=stripe&x=1')}`,
    );
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('Return to QuickPeek');
    expect(res.text).toContain('quickpeekfrontend://wallet/onboarding?from=stripe&amp;x=1');
    expect(res.text).toContain('window.location.replace');
  });

  it('renders the generic page without a deep link', async () => {
    const res = await request(app).get('/api/v1/payments/onboarding/return');
    expect(res.status).toBe(200);
    expect(res.text).toContain('close this page');
    expect(res.text).not.toContain('window.location.replace');
  });

  it('ignores unsafe, unparsable and hostless targets', async () => {
    for (const to of ['javascript:alert(1)', 'not a url', 'quickpeekfrontend:///x']) {
      const res = await request(app).get(
        `/api/v1/payments/onboarding/return?to=${encodeURIComponent(to)}`,
      );
      expect(res.status).toBe(200);
      expect(res.text).toContain('close this page');
      expect(res.text).not.toContain('window.location.replace');
    }
  });
});

describe('buildOnboardingRedirectUrl (unit)', () => {
  it('falls back for unparsable URLs (middleware normally rejects these)', async () => {
    const { buildOnboardingRedirectUrl } = await import(
      '../../../src/modules/payments/controllers/paymentController'
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fakeReq = { header: () => undefined, protocol: 'http' } as any;
    expect(buildOnboardingRedirectUrl(fakeReq, 'not a url', 'https://fallback.test/x')).toBe(
      'https://fallback.test/x',
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unparsable'));
    warn.mockRestore();
  });

  it('builds the api base from the request, defaulting to localhost', async () => {
    const { buildOnboardingRedirectUrl } = await import(
      '../../../src/modules/payments/controllers/paymentController'
    );
    const fakeReq = { header: () => undefined, protocol: 'http' } as any;
    expect(buildOnboardingRedirectUrl(fakeReq, 'quickpeekfrontend://wallet/onboarding', 'fb')).toBe(
      `http://localhost:3000/api/v1/payments/onboarding/return?to=${encodeURIComponent('quickpeekfrontend://wallet/onboarding')}`,
    );
  });
});
