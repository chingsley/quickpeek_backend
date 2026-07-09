// src / core / queues / index.ts

import { deviceUpdateQueue } from './deviceUpdateQueue';
import { userLocationUpdateQueue } from './userLocationUpdateQueue';
import { notifyNearbyUsersQueue } from './notifyNearbyUsersQueue';
import { sendAnswerToquestionCreatorQueue } from './sendAnswerToQuestionCreatorQueue';
import { userRatingsUpdateQueue } from './userRatingsUpdateQueue';
import { questionTimeoutQueue } from './questionTimeoutQueue';
import { notifyAssignedResponderQueue } from './notifyAssignedResponderQueue';
import { questionCleanupQueue } from './questionCleanupQueue';

import {
  processDeviceUpdate,
  processUserLocationUpdate,
  notifyNearbyUsers,
  sendAnswerToQuestionCreator,
  processUserRatings,
  handleClaimedQuestionTimeout,
  notifyAssignedResponder,
  cleanupQuestions,
} from '../jobs';

deviceUpdateQueue.process(processDeviceUpdate);
userLocationUpdateQueue.process(processUserLocationUpdate);
notifyNearbyUsersQueue.process(notifyNearbyUsers);
sendAnswerToquestionCreatorQueue.process(sendAnswerToQuestionCreator);
userRatingsUpdateQueue.process(processUserRatings);
questionTimeoutQueue.process(handleClaimedQuestionTimeout);
notifyAssignedResponderQueue.process(notifyAssignedResponder);
questionCleanupQueue.process(cleanupQuestions);

// Schedule the cleanup job to run daily. `repeat` is idempotent for the same
// key + repeat options, so re-importing this module (e.g. in tests) will not
// create duplicate schedules.
questionCleanupQueue.add(
  'cleanup',
  {},
  {
    repeat: { cron: '0 3 * * *' }, // daily at 03:00
    jobId: 'question-cleanup-daily',
  },
).catch((err) => {
  // Bull logs repeat-key conflicts as errors when the job already exists.
  console.warn('questionCleanupQueue schedule:', err?.message || err);
});