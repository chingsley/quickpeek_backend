// src / core / queues / index.ts

import { deviceUpdateQueue } from './deviceUpdateQueue';
import { userLocationUpdateQueue } from './userLocationUpdateQueue';
import { questionCleanupQueue } from './questionCleanupQueue';
import { reviewRevealQueue } from './reviewRevealQueue';

import {
  processDeviceUpdate,
  processUserLocationUpdate,
  cleanupQuestions,
  processReviewReveal,
} from '../jobs';

deviceUpdateQueue.process(processDeviceUpdate);
userLocationUpdateQueue.process(processUserLocationUpdate);
questionCleanupQueue.process(cleanupQuestions);
reviewRevealQueue.process(processReviewReveal);

questionCleanupQueue.add(
  'cleanup',
  {},
  {
    repeat: { cron: '0 3 * * *' },
    jobId: 'question-cleanup-daily',
  },
).catch((err) => {
  console.warn('questionCleanupQueue schedule:', err?.message || err);
});

reviewRevealQueue.add(
  'reveal-stale-reviews',
  {},
  {
    repeat: { cron: '0 4 * * *' },
    jobId: 'review-reveal-daily',
  },
).catch((err) => {
  console.warn('reviewRevealQueue schedule:', err?.message || err);
});
