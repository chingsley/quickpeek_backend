"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerForCurrency = exports.PAYSTACK_CURRENCIES = void 0;
/**
 * Currencies that route to Paystack (West/African markets); everything else
 * defaults to Stripe.
 */
exports.PAYSTACK_CURRENCIES = ['NGN', 'GHS', 'ZAR', 'KES'];
const providerForCurrency = (currency) => exports.PAYSTACK_CURRENCIES.includes(currency.toUpperCase()) ? 'PAYSTACK' : 'STRIPE';
exports.providerForCurrency = providerForCurrency;
