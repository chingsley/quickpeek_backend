import { PaymentProvider } from '@prisma/client';

export type PaymentCustomerInput = { email: string; name: string };

/**
 * Stripe uses `email`/`country`; Paystack subaccounts use the bank fields.
 * The service validates the right fields per provider before calling.
 */
export type ConnectedAccountInput = {
  email: string;
  country?: string;
  businessName?: string;
  bankCode?: string;
  accountNumber?: string;
  percentageCharge?: number;
};

export type ConnectedAccountStatus = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

export type ChargeInput = {
  amountMinor: number;
  currency: string;
  payerEmail: string;
  customerId: string | null;
  connectedAccountId: string;
  platformFeeMinor: number;
  idempotencyKey: string;
  metadata: Record<string, string>;
};

export type ChargeResult = {
  providerRef: string;
  stripe?: { clientSecret: string; customerId: string; ephemeralKey: string };
  paystack?: { authorizationUrl: string };
};

export type ChargeStatusResult = {
  status: 'succeeded' | 'pending' | 'failed';
  failureReason: string | null;
};

export type WebhookEvent =
  | { type: 'charge_succeeded'; providerRef: string }
  | { type: 'charge_failed'; providerRef: string; failureReason: string | null }
  | { type: 'account_updated'; connectedAccountId: string; payoutsEnabled: boolean }
  | { type: 'ignored' };

export type BankBrief = { name: string; code: string };

/**
 * Uniform driver each payment gateway implements. Optional members exist on
 * only one provider: hosted onboarding links (Stripe) and bank directory
 * lookups (Paystack).
 */
export interface PaymentProviderDriver {
  readonly provider: PaymentProvider;
  createCustomer(input: PaymentCustomerInput): Promise<{ customerId: string }>;
  createConnectedAccount(
    input: ConnectedAccountInput,
  ): Promise<{ connectedAccountId: string }>;
  createOnboardingLink?(input: {
    connectedAccountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  getConnectedAccountStatus(
    connectedAccountId: string,
  ): Promise<ConnectedAccountStatus>;
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  retrieveCharge(providerRef: string): Promise<ChargeStatusResult>;
  /** Throws when the signature is invalid. */
  parseWebhook(rawBody: Buffer, signatureHeader: string | undefined): WebhookEvent;
  listBanks?(): Promise<BankBrief[]>;
  resolveBankAccount?(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountName: string }>;
}
