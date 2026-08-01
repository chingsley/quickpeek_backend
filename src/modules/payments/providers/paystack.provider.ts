import crypto from 'crypto';
import {
  BankBrief,
  ChargeInput,
  ChargeResult,
  ChargeStatusResult,
  ConnectedAccountInput,
  ConnectedAccountStatus,
  PaymentCustomerInput,
  PaymentProviderDriver,
  WebhookEvent,
} from './paymentProvider.types';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Recognizable URL Paystack redirects to after checkout. The RN WebView
 * watches for this path in `onNavigationStateChange`; no real page is served.
 */
const callbackUrl = (): string =>
  process.env.PAYSTACK_CALLBACK_URL ?? 'https://payments.quickpeek.local/paystack/callback';

type PaystackEnvelope<T> = { status: boolean; message: string; data: T };

const paystackRequest = async <T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not configured');

  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as PaystackEnvelope<T>;
  if (!res.ok || !json.status) {
    throw new Error(json.message || `Paystack request failed (${res.status})`);
  }
  return json.data;
};

export const paystackProvider: PaymentProviderDriver = {
  provider: 'PAYSTACK',

  async createCustomer(input: PaymentCustomerInput) {
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    const data = await paystackRequest<{ customer_code: string }>('POST', '/customer', {
      email: input.email,
      first_name: firstName,
      last_name: rest.length > 0 ? rest.join(' ') : firstName,
    });
    return { customerId: data.customer_code };
  },

  async createConnectedAccount(input: ConnectedAccountInput) {
    const data = await paystackRequest<{ subaccount_code: string }>('POST', '/subaccount', {
      business_name: input.businessName,
      settlement_bank: input.bankCode,
      account_number: input.accountNumber,
      percentage_charge: input.percentageCharge,
    });
    return { connectedAccountId: data.subaccount_code };
  },

  async getConnectedAccountStatus(
    connectedAccountId: string,
  ): Promise<ConnectedAccountStatus> {
    const data = await paystackRequest<{ active: boolean }>(
      'GET',
      `/subaccount/${connectedAccountId}`,
    );
    return {
      chargesEnabled: data.active,
      payoutsEnabled: data.active,
      detailsSubmitted: true,
    };
  },

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    const data = await paystackRequest<{ authorization_url: string; reference: string }>(
      'POST',
      '/transaction/initialize',
      {
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
      },
    );
    return {
      providerRef: data.reference,
      paystack: { authorizationUrl: data.authorization_url },
    };
  },

  async retrieveCharge(providerRef: string): Promise<ChargeStatusResult> {
    const data = await paystackRequest<{ status: string; gateway_response?: string }>(
      'GET',
      `/transaction/verify/${providerRef}`,
    );
    if (data.status === 'success') {
      return { status: 'succeeded', failureReason: null };
    }
    if (data.status === 'failed' || data.status === 'abandoned') {
      return { status: 'failed', failureReason: data.gateway_response ?? null };
    }
    return { status: 'pending', failureReason: null };
  },

  parseWebhook(rawBody: Buffer, signatureHeader: string | undefined): WebhookEvent {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not configured');

    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    if (expected !== signatureHeader) {
      throw new Error('Invalid Paystack webhook signature');
    }

    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      data: { reference?: string };
    };
    if (event.event === 'charge.success') {
      return { type: 'charge_succeeded', providerRef: event.data.reference! };
    }
    return { type: 'ignored' };
  },

  async listBanks(): Promise<BankBrief[]> {
    const data = await paystackRequest<{ name: string; code: string }[]>(
      'GET',
      '/bank?currency=NGN&perPage=100',
    );
    return data.map((bank) => ({ name: bank.name, code: bank.code }));
  },

  async resolveBankAccount(input: { accountNumber: string; bankCode: string }) {
    const data = await paystackRequest<{ account_name: string }>(
      'GET',
      `/bank/resolve?account_number=${input.accountNumber}&bank_code=${input.bankCode}`,
    );
    return { accountName: data.account_name };
  },
};
