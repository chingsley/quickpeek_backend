import { sendAnswerToquestionCreator } from './../jobs/sendAnswerToquestionCreator';
import { deviceUpdateQueue } from './deviceUpdateQueue';
import { userLocationUpdateQueue } from './userLocationUpdateQueue';
import { notifyNearbyUsersQueue } from './notifyNearbyUsersQueue';

import {
  processDeviceUpdate,
  processUserLocationUpdate,
  notifyNearbyUsers
} from '../jobs';
import { sendAnswerToquestionCreatorQueue } from './sendAnswerToquestionCreatorQueue';

deviceUpdateQueue.process(processDeviceUpdate);
userLocationUpdateQueue.process(processUserLocationUpdate);
notifyNearbyUsersQueue.process(notifyNearbyUsers);
sendAnswerToquestionCreatorQueue.process(sendAnswerToquestionCreator);