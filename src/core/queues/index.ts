import { sendAnswerToQuestioner } from './../jobs/sendAnswerToQuestioner';
import { deviceUpdateQueue } from './deviceUpdateQueue';
import { userLocationUpdateQueue } from './userLocationUpdateQueue';
import { notifyNearbyUsersQueue } from './notifyNearbyUsersQueue';

import {
  processDeviceUpdate,
  processUserLocationUpdate,
  notifyNearbyUsers
} from '../jobs';
import { sendAnswerToQuestionerQueue } from './sendAnswerToQuestionerQueue';

deviceUpdateQueue.process(processDeviceUpdate);
userLocationUpdateQueue.process(processUserLocationUpdate);
notifyNearbyUsersQueue.process(notifyNearbyUsers);
sendAnswerToQuestionerQueue.process(sendAnswerToQuestioner);