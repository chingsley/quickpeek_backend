import { PaymentProvider } from '@prisma/client';

/**
 * Currencies that route to Paystack (West/African markets); everything else
 * defaults to Stripe.
 */
export const PAYSTACK_CURRENCIES = ['NGN', 'GHS', 'ZAR', 'KES'];

export const providerForCurrency = (currency: string): PaymentProvider =>
  PAYSTACK_CURRENCIES.includes(currency.toUpperCase()) ? 'PAYSTACK' : 'STRIPE';
