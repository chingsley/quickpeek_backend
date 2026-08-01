import { Router } from 'express';
import {
  handlePaystackWebhook,
  handleStripeWebhook,
} from '../controllers/paymentWebhookController';

// Mounted in app.ts with `express.raw` BEFORE the global JSON parser —
// signature verification needs the exact request bytes.
const router = Router();

router.post('/stripe', handleStripeWebhook);
router.post('/paystack', handlePaystackWebhook);

export default router;
