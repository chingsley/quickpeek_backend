import Queue from 'bull';
import { getRedisConnectionOptions } from '../config/redisOptions';

/**
 * Expo delivery receipts are not available at send time — Expo needs time to
 * hand the message to APNs/FCM and record the outcome. Receipt checks are
 * therefore deferred through this queue rather than called inline.
 */
export const pushReceiptQueue = new Queue('push-receipts', {
  redis: getRedisConnectionOptions(),
});

/** Delay before the receipt lookup runs; Expo recommends waiting ~15 minutes. */
export const PUSH_RECEIPT_DELAY_MS = 15 * 60_000;
