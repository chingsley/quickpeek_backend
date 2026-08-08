import { Job } from 'bull';
import { processPushReceipts } from '../../common/utils/push';

/**
 * Looks up Expo delivery receipts for a previously sent batch and prunes
 * device tokens Expo reports as permanently dead. Enqueued with a delay by
 * `sendPushToTokens` because receipts don't exist at send time.
 */
const processPushReceiptJob = async (job: Job) => {
  const { tokenByTicketId } = job.data as { tokenByTicketId?: Record<string, string>; };
  if (!tokenByTicketId) return;

  await processPushReceipts(tokenByTicketId);
};

export default processPushReceiptJob;
