import Queue from 'bull';
import { getRedisConnectionOptions } from '../config/redisOptions';

const deviceUpdateQueue = new Queue('deviceUpdateQueue', {
  redis: getRedisConnectionOptions(),
});

export { deviceUpdateQueue };
