"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentProvider = void 0;
const stripe_provider_1 = require("./stripe.provider");
const paystack_provider_1 = require("./paystack.provider");
const getPaymentProvider = (provider) => provider === 'PAYSTACK' ? paystack_provider_1.paystackProvider : stripe_provider_1.stripeProvider;
exports.getPaymentProvider = getPaymentProvider;
