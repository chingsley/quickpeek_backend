import Queue from 'bull';

const userRatingsUpdateQueue = new Queue('userRatingsUpdateQueue', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});

export { userRatingsUpdateQueue };
