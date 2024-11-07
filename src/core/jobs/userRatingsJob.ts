import { Job } from 'bull';
import prisma from '../database/prisma/client';
import redisClient from '../config/redis';

const processUserRating = async (job: Job) => {
  // console.log('\n....... execution job.....\n', job.data);
  try {
    const { userId, rating } = job.data;

    await prisma.$executeRaw`BEGIN TRANSACTION`;
    let totalRating: number = rating;
    let answersCount: number = 1;
    const currentRating = await prisma.userRating.findUnique({ where: { userId } });
    if (currentRating) {
      totalRating = currentRating.totalRating + rating;
      answersCount = currentRating.answersCount + 1;
      await prisma.userRating.update({
        where: { userId },
        data: { totalRating, answersCount }
      });
    } else {
      // create first rating for user: totalRatings = ratings, answersCount = 1
      await prisma.userRating.create({
        data: { userId, totalRating, answersCount }
      });
    }
    await prisma.$executeRaw`COMMIT TRANSACTION`;

    // Update the cache
    const cacheKey = `userRating:${userId}`;
    await redisClient.set(cacheKey, JSON.stringify({ totalRating, answersCount }), 'EX', 60 * 60);
    console.log(`Updated rating for user ${userId}`);
  } catch (error) {
    await prisma.$executeRaw`ROLLBACK TRANSACTION`;
    console.error('Failed to update user rating', error);
  }
};

export default processUserRating;