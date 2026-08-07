import Queue from 'bull';
import { getRedisConnectionOptions } from '../config/redisOptions';

export const reviewRevealQueue = new Queue('review-reveal', {
  redis: getRedisConnectionOptions(),
});
