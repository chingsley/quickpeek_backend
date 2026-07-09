import Queue from 'bull';

export const questionCleanupQueue = new Queue('question-cleanup', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});
