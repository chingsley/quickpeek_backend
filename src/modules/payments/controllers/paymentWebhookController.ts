import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import { WebhookEvent } from '../providers/paymentProvider.types';
import { stripeProvider } from '../providers/stripe.provider';
import { paystackProvider } from '../providers/paystack.provider';
import { finalizeChargeOutcome } from '../services/payments.service';

/**
 * Shared post-parse handling for both providers. Unknown provider refs are
 * acknowledged quietly — providers deliver events for charges this app did
 * not initiate too.
 */
const processWebhookEvent = async (event: WebhookEvent): Promise<void> => {
  if (event.type === 'charge_succeeded') {
    await finalizeChargeOutcome({
      providerRef: event.providerRef,
      outcome: { status: 'succeeded', failureReason: null },
    });
  } else if (event.type === 'charge_failed') {
    await finalizeChargeOutcome({
      providerRef: event.providerRef,
      outcome: { status: 'failed', failureReason: event.failureReason },
    });
  } else if (event.type === 'account_updated') {
    await prisma.paymentAccount.updateMany({
      where: { connectedAccountId: event.connectedAccountId },
      data: {
        payoutsEnabled: event.payoutsEnabled,
        ...(event.payoutsEnabled ? { status: 'ACTIVE' as const } : {}),
      },
    });
  }
};

/**
 * POST /payments/webhooks/stripe — mounted with `express.raw` before the
 * JSON parser so the signature covers the exact payload bytes.
 */
export const handleStripeWebhook = async (req: Request, res: Response) => {
  let event: WebhookEvent;
  try {
    event = stripeProvider.parseWebhook(req.body, req.header('stripe-signature'));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }

  try {
    await processWebhookEvent(event);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('handleStripeWebhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/** POST /payments/webhooks/paystack — raw body required for the HMAC. */
export const handlePaystackWebhook = async (req: Request, res: Response) => {
  let event: WebhookEvent;
  try {
    event = paystackProvider.parseWebhook(req.body, req.header('x-paystack-signature'));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }

  try {
    await processWebhookEvent(event);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('handlePaystackWebhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
