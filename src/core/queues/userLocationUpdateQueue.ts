import Queue from 'bull';

const userLocationUpdateQueue = new Queue('userLocationUpdateQueue', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});

export { userLocationUpdateQueue };
