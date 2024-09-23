import { deviceUpdateQueue } from './deviceUpdateQueue';
import { userLocationUpdateQueue } from './userLocationUpdateQueue';
import { notifyNearbyUsersQueue } from './notifyNearbyUsersQueue';
import { sendAnswerToquestionCreatorQueue } from './sendAnswerToQuestionCreatorQueue';
import { userRatingsUpdateQueue } from './userRatingsUpdateQueue';

import {
  processDeviceUpdate,
  processUserLocationUpdate,
  notifyNearbyUsers,
  sendAnswerToQuestionCreator,
  processUserRatings,
} from '../jobs';

deviceUpdateQueue.process(processDeviceUpdate);
userLocationUpdateQueue.process(processUserLocationUpdate);
notifyNearbyUsersQueue.process(notifyNearbyUsers);
sendAnswerToquestionCreatorQueue.process(sendAnswerToQuestionCreator);
userRatingsUpdateQueue.process(processUserRatings);