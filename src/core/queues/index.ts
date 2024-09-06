import { deviceUpdateQueue } from './deviceUpdateQueue';
import { userLocationUpdateQueue } from './userLocationUpdateQueue';
import processDeviceUpdate from '../jobs/deviceUpdateJob';
import processUserLocationUpdate from '../jobs/userLocationUpdateJob';

deviceUpdateQueue.process(processDeviceUpdate);
userLocationUpdateQueue.process(processUserLocationUpdate);