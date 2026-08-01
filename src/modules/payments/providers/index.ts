import { PaymentProvider } from '@prisma/client';
import { PaymentProviderDriver } from './paymentProvider.types';
import { stripeProvider } from './stripe.provider';
import { paystackProvider } from './paystack.provider';

export const getPaymentProvider = (provider: PaymentProvider): PaymentProviderDriver =>
  provider === 'PAYSTACK' ? paystackProvider : stripeProvider;
