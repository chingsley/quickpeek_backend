import Queue from 'bull';
// import redisClient from '../config/redis';

const deviceUpdateQueue = new Queue('deviceUpdateQueue', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});

export { deviceUpdateQueue };
