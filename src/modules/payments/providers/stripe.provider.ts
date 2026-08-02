import Stripe from 'stripe';
import {
  ChargeInput,
  ChargeResult,
  ChargeStatusResult,
  ConnectedAccountInput,
  ConnectedAccountStatus,
  PaymentCustomerInput,
  PaymentProviderDriver,
  WebhookEvent,
} from './paymentProvider.types';

/**
 * Pinned to the API version bundled with the installed SDK. Ephemeral key
 * creation rejects requests that omit an explicit API version.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia';

let client: Stripe | null = null;

const getClient = (): Stripe => {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    client = new Stripe(key);
  }
  return client;
};

const webhookSecret = (): string => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return secret;
};

export const stripeProvider: PaymentProviderDriver = {
  provider: 'STRIPE',

  async createCustomer(input: PaymentCustomerInput) {
    const customer = await getClient().customers.create({
      email: input.email,
      name: input.name,
    });
    return { customerId: customer.id };
  },

  async createConnectedAccount(input: ConnectedAccountInput) {
    const account = await getClient().accounts.create({
      type: 'express',
      email: input.email,
      country: input.country ?? 'US',
      // Responders are individuals; Stripe requires card_payments alongside
      // transfers for US accounts, and that capability would otherwise put
      // industry/website ("Business details") into the requirements. Both are
      // platform-level facts, so satisfy them here and keep the hosted form
      // to personal details + bank only.
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
    return { connectedAccountId: account.id };
  },

  async createOnboardingLink(input) {
    const link = await getClient().accountLinks.create({
      account: input.connectedAccountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      // Only ask for what is currently required — keeps the hosted flow
      // short and avoids sections that don't apply yet.
      collect: 'currently_due',
      type: 'account_onboarding',
    });
    return { url: link.url };
  },

  async getConnectedAccountStatus(
    connectedAccountId: string,
  ): Promise<ConnectedAccountStatus> {
    const account = await getClient().accounts.retrieve(connectedAccountId);
    return {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    };
  },

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    const params: Stripe.PaymentIntentCreateParams = {
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      customer: input.customerId ?? undefined,
      automatic_payment_methods: { enabled: true },
      transfer_data: { destination: input.connectedAccountId },
      metadata: input.metadata,
    };
    if (input.platformFeeMinor > 0) {
      params.application_fee_amount = input.platformFeeMinor;
    }

    const intent = await getClient().paymentIntents.create(params, {
      idempotencyKey: input.idempotencyKey,
    });
    const ephemeralKey = await getClient().ephemeralKeys.create(
      { customer: input.customerId! },
      { apiVersion: STRIPE_API_VERSION },
    );

    return {
      providerRef: intent.id,
      stripe: {
        clientSecret: intent.client_secret!,
        customerId: input.customerId!,
        ephemeralKey: ephemeralKey.secret!,
      },
    };
  },

  async retrieveCharge(providerRef: string): Promise<ChargeStatusResult> {
    const intent = await getClient().paymentIntents.retrieve(providerRef);
    if (intent.status === 'succeeded') {
      return { status: 'succeeded', failureReason: null };
    }
    if (intent.status === 'canceled' || intent.status === 'requires_payment_method') {
      return {
        status: 'failed',
        failureReason: intent.last_payment_error?.message ?? null,
      };
    }
    return { status: 'pending', failureReason: null };
  },

  parseWebhook(rawBody: Buffer, signatureHeader: string | undefined): WebhookEvent {
    const secret = webhookSecret();
    let event: Stripe.Event;
    try {
      event = getClient().webhooks.constructEvent(rawBody, signatureHeader ?? '', secret);
    } catch {
      throw new Error('Invalid Stripe webhook signature');
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        return { type: 'charge_succeeded', providerRef: intent.id };
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          type: 'charge_failed',
          providerRef: intent.id,
          failureReason: intent.last_payment_error?.message ?? null,
        };
      }
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
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
