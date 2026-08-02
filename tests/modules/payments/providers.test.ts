import crypto from 'crypto';

jest.mock('stripe', () => {
  const mStripe = {
    customers: { create: jest.fn() },
    accounts: { create: jest.fn(), retrieve: jest.fn() },
    accountLinks: { create: jest.fn() },
    paymentIntents: { create: jest.fn(), retrieve: jest.fn() },
    ephemeralKeys: { create: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
  };
  return { __esModule: true, default: jest.fn(() => mStripe) };
});

import Stripe from 'stripe';
import { stripeProvider } from '../../../src/modules/payments/providers/stripe.provider';
import { paystackProvider } from '../../../src/modules/payments/providers/paystack.provider';
import { getPaymentProvider } from '../../../src/modules/payments/providers';
import { providerForCurrency } from '../../../src/modules/payments/providers/currencies';

const mStripe = new (Stripe as unknown as new () => {
  customers: { create: jest.Mock };
  accounts: { create: jest.Mock; retrieve: jest.Mock };
  accountLinks: { create: jest.Mock };
  paymentIntents: { create: jest.Mock; retrieve: jest.Mock };
  ephemeralKeys: { create: jest.Mock };
  webhooks: { constructEvent: jest.Mock };
})();

const STRIPE_KEY = 'sk_test_unit';
const PAYSTACK_KEY = 'sk_test_paystack_unit';

const fetchOk = (data: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ status: true, message: 'ok', data }),
  } as Response);

const fetchErr = (message: string) =>
  Promise.resolve({
    ok: false,
    status: 400,
    json: () => Promise.resolve({ status: false, message }),
  } as Response);

const mockFetch = jest.fn();

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit';
  process.env.PAYSTACK_SECRET_KEY = PAYSTACK_KEY;
  global.fetch = mockFetch as unknown as typeof fetch;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('provider factory', () => {
  it('maps currencies to providers (case-insensitive)', () => {
    expect(providerForCurrency('NGN')).toBe('PAYSTACK');
    expect(providerForCurrency('ngn')).toBe('PAYSTACK');
    expect(providerForCurrency('GHS')).toBe('PAYSTACK');
    expect(providerForCurrency('ZAR')).toBe('PAYSTACK');
    expect(providerForCurrency('KES')).toBe('PAYSTACK');
    expect(providerForCurrency('USD')).toBe('STRIPE');
    expect(providerForCurrency('eur')).toBe('STRIPE');
  });

  it('returns the driver for each provider', () => {
    expect(getPaymentProvider('STRIPE')).toBe(stripeProvider);
    expect(getPaymentProvider('PAYSTACK')).toBe(paystackProvider);
    expect(getPaymentProvider('STRIPE').provider).toBe('STRIPE');
    expect(getPaymentProvider('PAYSTACK').provider).toBe('PAYSTACK');
  });
});

describe('stripe provider', () => {
  it('creates a customer', async () => {
    mStripe.customers.create.mockResolvedValue({ id: 'cus_1' });
    const result = await stripeProvider.createCustomer({ email: 'a@b.c', name: 'Ada' });
    expect(mStripe.customers.create).toHaveBeenCalledWith({ email: 'a@b.c', name: 'Ada' });
    expect(result).toEqual({ customerId: 'cus_1' });
  });

  it('creates an express individual account with a prefilled business profile', async () => {
    mStripe.accounts.create.mockResolvedValue({ id: 'acct_1' });
    const result = await stripeProvider.createConnectedAccount({ email: 'a@b.c' });
    expect(mStripe.accounts.create).toHaveBeenCalledWith({
      type: 'express',
      email: 'a@b.c',
      country: 'US',
      business_type: 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        mcc: '8999',
        product_description:
          'On-demand answers to user questions about local places and services.',
      },
    });
    expect(result).toEqual({ connectedAccountId: 'acct_1' });
  });

  it('creates an express connected account with explicit country', async () => {
    mStripe.accounts.create.mockResolvedValue({ id: 'acct_2' });
    await stripeProvider.createConnectedAccount({ email: 'a@b.c', country: 'GB' });
    expect(mStripe.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'GB' }),
    );
  });

  it('creates an onboarding link', async () => {
    mStripe.accountLinks.create.mockResolvedValue({ url: 'https://stripe.test/onboard' });
    const result = await stripeProvider.createOnboardingLink!({
      connectedAccountId: 'acct_1',
      refreshUrl: 'https://app.test/refresh',
      returnUrl: 'https://app.test/return',
    });
    expect(mStripe.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_1',
      refresh_url: 'https://app.test/refresh',
      return_url: 'https://app.test/return',
      collect: 'currently_due',
      type: 'account_onboarding',
    });
    expect(result).toEqual({ url: 'https://stripe.test/onboard' });
  });

  it('reads connected account status', async () => {
    mStripe.accounts.retrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    });
    const status = await stripeProvider.getConnectedAccountStatus('acct_1');
    expect(mStripe.accounts.retrieve).toHaveBeenCalledWith('acct_1');
    expect(status).toEqual({
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
    });
  });

  it('creates a destination charge with an application fee', async () => {
    mStripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_1',
      client_secret: 'pi_1_secret',
    });
    mStripe.ephemeralKeys.create.mockResolvedValue({ secret: 'ek_1' });

    const result = await stripeProvider.createCharge({
      amountMinor: 2500,
      currency: 'USD',
      payerEmail: 'payer@test.dev',
      customerId: 'cus_1',
      connectedAccountId: 'acct_1',
      platformFeeMinor: 250,
      idempotencyKey: 'req-1',
      metadata: { answerRequestId: 'req-1' },
    });

    expect(mStripe.paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 2500,
        currency: 'usd',
        customer: 'cus_1',
        automatic_payment_methods: { enabled: true },
        transfer_data: { destination: 'acct_1' },
        application_fee_amount: 250,
        metadata: { answerRequestId: 'req-1' },
      },
      { idempotencyKey: 'req-1' },
    );
    expect(mStripe.ephemeralKeys.create).toHaveBeenCalledWith(
      { customer: 'cus_1' },
      { apiVersion: expect.any(String) },
    );
    expect(result).toEqual({
      providerRef: 'pi_1',
      stripe: { clientSecret: 'pi_1_secret', customerId: 'cus_1', ephemeralKey: 'ek_1' },
    });
  });

  it('omits the application fee when it is zero', async () => {
    mStripe.paymentIntents.create.mockResolvedValue({ id: 'pi_2', client_secret: 's' });
    mStripe.ephemeralKeys.create.mockResolvedValue({ secret: 'ek_2' });

    await stripeProvider.createCharge({
      amountMinor: 1000,
      currency: 'usd',
      payerEmail: 'payer@test.dev',
      customerId: 'cus_1',
      connectedAccountId: 'acct_1',
      platformFeeMinor: 0,
      idempotencyKey: 'req-2',
      metadata: {},
    });

    const params = mStripe.paymentIntents.create.mock.calls[0][0];
    expect(params).not.toHaveProperty('application_fee_amount');
  });

  it('maps retrieve statuses', async () => {
    mStripe.paymentIntents.retrieve.mockResolvedValue({ status: 'succeeded' });
    expect(await stripeProvider.retrieveCharge('pi_1')).toEqual({
      status: 'succeeded',
      failureReason: null,
    });

    mStripe.paymentIntents.retrieve.mockResolvedValue({
      status: 'requires_payment_method',
      last_payment_error: { message: 'card declined' },
    });
    expect(await stripeProvider.retrieveCharge('pi_1')).toEqual({
      status: 'failed',
      failureReason: 'card declined',
    });

    mStripe.paymentIntents.retrieve.mockResolvedValue({ status: 'canceled' });
    expect(await stripeProvider.retrieveCharge('pi_1')).toEqual({
      status: 'failed',
      failureReason: null,
    });

    mStripe.paymentIntents.retrieve.mockResolvedValue({ status: 'processing' });
    expect(await stripeProvider.retrieveCharge('pi_1')).toEqual({
      status: 'pending',
      failureReason: null,
    });
  });

  it('parses webhook events', () => {
    mStripe.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_9' } },
    });
    expect(stripeProvider.parseWebhook(Buffer.from('{}'), 'sig')).toEqual({
      type: 'charge_succeeded',
      providerRef: 'pi_9',
    });

    mStripe.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_8', last_payment_error: { message: 'boom' } } },
    });
    expect(stripeProvider.parseWebhook(Buffer.from('{}'), 'sig')).toEqual({
      type: 'charge_failed',
      providerRef: 'pi_8',
      failureReason: 'boom',
    });

    mStripe.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_8b', last_payment_error: null } },
    });
    expect(stripeProvider.parseWebhook(Buffer.from('{}'), 'sig')).toEqual({
      type: 'charge_failed',
      providerRef: 'pi_8b',
      failureReason: null,
    });

    mStripe.webhooks.constructEvent.mockReturnValue({
      type: 'account.updated',
      data: { object: { id: 'acct_9', payouts_enabled: true } },
    });
    expect(stripeProvider.parseWebhook(Buffer.from('{}'), 'sig')).toEqual({
      type: 'account_updated',
      connectedAccountId: 'acct_9',
      payoutsEnabled: true,
    });

    mStripe.webhooks.constructEvent.mockReturnValue({
      type: 'customer.created',
      data: { object: {} },
    });
    expect(stripeProvider.parseWebhook(Buffer.from('{}'), 'sig')).toEqual({
      type: 'ignored',
    });
  });

  it('omits the customer when none is provided', async () => {
    mStripe.paymentIntents.create.mockResolvedValue({ id: 'pi_3', client_secret: 's' });
    mStripe.ephemeralKeys.create.mockResolvedValue({ secret: 'ek_3' });

    await stripeProvider.createCharge({
      amountMinor: 1000,
      currency: 'usd',
      payerEmail: 'payer@test.dev',
      customerId: null,
      connectedAccountId: 'acct_1',
      platformFeeMinor: 0,
      idempotencyKey: 'req-3',
      metadata: {},
    });

    const params = mStripe.paymentIntents.create.mock.calls[0][0];
    expect(params.customer).toBeUndefined();
  });

  it('parses a webhook when the signature header is absent', () => {
    mStripe.webhooks.constructEvent.mockReturnValue({
      type: 'customer.created',
      data: { object: {} },
    });
    expect(stripeProvider.parseWebhook(Buffer.from('{}'), undefined)).toEqual({
      type: 'ignored',
    });
    expect(mStripe.webhooks.constructEvent).toHaveBeenCalledWith(
      expect.anything(),
      '',
      'whsec_unit',
    );
  });

  it('throws when STRIPE_WEBHOOK_SECRET is missing', () => {
    const saved = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      expect(() => stripeProvider.parseWebhook(Buffer.from('{}'), 'sig')).toThrow(
        'STRIPE_WEBHOOK_SECRET is not configured',
      );
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = saved;
    }
  });

  it('throws on an invalid webhook signature', () => {
    mStripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });
    expect(() => stripeProvider.parseWebhook(Buffer.from('{}'), 'bad')).toThrow(
      'Invalid Stripe webhook signature',
    );
  });

  it('throws when STRIPE_SECRET_KEY is missing', async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    jest.resetModules();
    const { stripeProvider: fresh } = await import(
      '../../../src/modules/payments/providers/stripe.provider'
    );
    await expect(fresh.createCustomer({ email: 'a@b.c', name: 'A' })).rejects.toThrow(
      'STRIPE_SECRET_KEY is not configured',
    );
    process.env.STRIPE_SECRET_KEY = saved;
  });
});

describe('paystack provider', () => {
  it('creates a customer splitting the name', async () => {
    mockFetch.mockReturnValue(fetchOk({ customer_code: 'CUS_1' }));
    const result = await paystackProvider.createCustomer({
      email: 'ada@test.dev',
      name: 'Ada Lovelace',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.paystack.co/customer',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${PAYSTACK_KEY}` }),
        body: JSON.stringify({
          email: 'ada@test.dev',
          first_name: 'Ada',
          last_name: 'Lovelace',
        }),
      }),
    );
    expect(result).toEqual({ customerId: 'CUS_1' });

    mockFetch.mockReturnValue(fetchOk({ customer_code: 'CUS_2' }));
    await paystackProvider.createCustomer({ email: 'm@test.dev', name: 'Madonna' });
    expect(JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      email: 'm@test.dev',
      first_name: 'Madonna',
      last_name: 'Madonna',
    });
  });

  it('creates a subaccount as the connected account', async () => {
    mockFetch.mockReturnValue(fetchOk({ subaccount_code: 'ACCT_1' }));
    const result = await paystackProvider.createConnectedAccount({
      email: 'r@test.dev',
      businessName: 'Responder',
      bankCode: '058',
      accountNumber: '0123456789',
      percentageCharge: 90,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.paystack.co/subaccount',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          business_name: 'Responder',
          settlement_bank: '058',
          account_number: '0123456789',
          percentage_charge: 90,
        }),
      }),
    );
    expect(result).toEqual({ connectedAccountId: 'ACCT_1' });
  });

  it('reads subaccount status', async () => {
    mockFetch.mockReturnValue(fetchOk({ active: true }));
    expect(await paystackProvider.getConnectedAccountStatus('ACCT_1')).toEqual({
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.paystack.co/subaccount/ACCT_1',
      expect.objectContaining({ method: 'GET' }),
    );

    mockFetch.mockReturnValue(fetchOk({ active: false }));
    expect(await paystackProvider.getConnectedAccountStatus('ACCT_1')).toEqual({
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: true,
    });
  });

  it('initializes a charge against the subaccount', async () => {
    mockFetch.mockReturnValue(
      fetchOk({ authorization_url: 'https://paystack.test/pay/xyz', reference: 'ref_1' }),
    );
    const result = await paystackProvider.createCharge({
      amountMinor: 500000,
      currency: 'NGN',
      payerEmail: 'payer@test.dev',
      customerId: null,
      connectedAccountId: 'ACCT_1',
      platformFeeMinor: 0,
      idempotencyKey: 'req-1',
      metadata: { answerRequestId: 'req-1' },
    });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/transaction/initialize');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      email: 'payer@test.dev',
      amount: 500000,
      currency: 'NGN',
      subaccount: 'ACCT_1',
      bearer: 'subaccount',
      metadata: { answerRequestId: 'req-1' },
    });
    expect(body.reference).toContain('req-1');
    expect(body.callback_url).toContain('paystack/callback');
    expect(result).toEqual({
      providerRef: 'ref_1',
      paystack: { authorizationUrl: 'https://paystack.test/pay/xyz' },
    });
  });

  it('maps verify statuses', async () => {
    mockFetch.mockReturnValue(fetchOk({ status: 'success' }));
    expect(await paystackProvider.retrieveCharge('ref_1')).toEqual({
      status: 'succeeded',
      failureReason: null,
    });

    mockFetch.mockReturnValue(fetchOk({ status: 'failed', gateway_response: 'Declined' }));
    expect(await paystackProvider.retrieveCharge('ref_1')).toEqual({
      status: 'failed',
      failureReason: 'Declined',
    });

    mockFetch.mockReturnValue(fetchOk({ status: 'abandoned' }));
    expect(await paystackProvider.retrieveCharge('ref_1')).toEqual({
      status: 'failed',
      failureReason: null,
    });

    mockFetch.mockReturnValue(fetchOk({ status: 'pending' }));
    expect(await paystackProvider.retrieveCharge('ref_1')).toEqual({
      status: 'pending',
      failureReason: null,
    });
  });

  it('parses a charge.success webhook with a valid signature', () => {
    const payload = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'ref_9' },
    });
    const sig = crypto.createHmac('sha512', PAYSTACK_KEY).update(payload).digest('hex');
    expect(paystackProvider.parseWebhook(Buffer.from(payload), sig)).toEqual({
      type: 'charge_succeeded',
      providerRef: 'ref_9',
    });
  });

  it('ignores unknown webhook events', () => {
    const payload = JSON.stringify({ event: 'transfer.success', data: {} });
    const sig = crypto.createHmac('sha512', PAYSTACK_KEY).update(payload).digest('hex');
    expect(paystackProvider.parseWebhook(Buffer.from(payload), sig)).toEqual({
      type: 'ignored',
    });
  });

  it('throws on an invalid webhook signature', () => {
    expect(() => paystackProvider.parseWebhook(Buffer.from('{}'), 'bad-sig')).toThrow(
      'Invalid Paystack webhook signature',
    );
  });

  it('lists banks', async () => {
    mockFetch.mockReturnValue(
      fetchOk([
        { name: 'GTBank', code: '058', active: true },
        { name: 'Zenith', code: '057', active: true },
      ]),
    );
    const banks = await paystackProvider.listBanks!();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.paystack.co/bank'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(banks).toEqual([
      { name: 'GTBank', code: '058' },
      { name: 'Zenith', code: '057' },
    ]);
  });

  it('resolves a bank account name', async () => {
    mockFetch.mockReturnValue(fetchOk({ account_name: 'ADA LOVELACE' }));
    const result = await paystackProvider.resolveBankAccount!({
      accountNumber: '0123456789',
      bankCode: '058',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.paystack.co/bank/resolve?account_number=0123456789&bank_code=058',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({ accountName: 'ADA LOVELACE' });
  });

  it('uses the PAYSTACK_CALLBACK_URL override when configured', async () => {
    process.env.PAYSTACK_CALLBACK_URL = 'https://custom.test/paystack/callback';
    try {
      mockFetch.mockReturnValue(
        fetchOk({ authorization_url: 'https://paystack.test/pay/cb', reference: 'ref_cb' }),
      );
      await paystackProvider.createCharge({
        amountMinor: 1000,
        currency: 'NGN',
        payerEmail: 'payer@test.dev',
        customerId: null,
        connectedAccountId: 'ACCT_1',
        platformFeeMinor: 0,
        idempotencyKey: 'req-cb',
        metadata: {},
      });
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.callback_url).toBe('https://custom.test/paystack/callback');
    } finally {
      delete process.env.PAYSTACK_CALLBACK_URL;
    }
  });

  it('throws the status-code fallback when the API error has no message', async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ status: false, message: '' }),
      } as Response),
    );
    await expect(paystackProvider.retrieveCharge('ref_x')).rejects.toThrow(
      'Paystack request failed (500)',
    );
  });

  it('throws when the API reports failure on an OK response', async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: false, message: 'Verification failed' }),
      } as Response),
    );
    await expect(paystackProvider.retrieveCharge('ref_y')).rejects.toThrow(
      'Verification failed',
    );
  });

  it('throws from parseWebhook when PAYSTACK_SECRET_KEY is missing', () => {
    const saved = process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    try {
      expect(() => paystackProvider.parseWebhook(Buffer.from('{}'), 'sig')).toThrow(
        'PAYSTACK_SECRET_KEY is not configured',
      );
    } finally {
      process.env.PAYSTACK_SECRET_KEY = saved;
    }
  });

  it('throws the provider message on API errors', async () => {
    mockFetch.mockReturnValue(fetchErr('Duplicate reference'));
    await expect(paystackProvider.retrieveCharge('ref_dup')).rejects.toThrow(
      'Duplicate reference',
    );
  });

  it('throws when PAYSTACK_SECRET_KEY is missing', async () => {
    const saved = process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    await expect(
      paystackProvider.createCustomer({ email: 'a@b.c', name: 'A' }),
    ).rejects.toThrow('PAYSTACK_SECRET_KEY is not configured');
    process.env.PAYSTACK_SECRET_KEY = saved;
  });
});
