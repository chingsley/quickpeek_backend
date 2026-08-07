import Queue from 'bull';
import { getRedisConnectionOptions } from '../config/redisOptions';

export const questionCleanupQueue = new Queue('question-cleanup', {
  redis: getRedisConnectionOptions(),
});
