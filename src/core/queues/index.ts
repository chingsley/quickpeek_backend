import { deviceUpdateQueue } from './deviceUpdateQueue';
import processDeviceUpdate from '../jobs/deviceUpdateJob';

deviceUpdateQueue.process(processDeviceUpdate);