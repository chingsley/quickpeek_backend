import Redis from 'ioredis';
import { getRedisConnectionOptions } from './redisOptions';

const redisClient = new Redis(getRedisConnectionOptions());

export default redisClient;
