import { Job } from 'bull';
import { RatingRole } from '@prisma/client';
import prisma from '../database/prisma/client';
import redisClient from '../config/redis';

const processUserRating = async (job: Job) => {
  try {
    const { userId, rating, role = RatingRole.AS_RESPONDER } = job.data;

    await prisma.$executeRaw`BEGIN TRANSACTION`;
    let totalStars: number = rating;
    let reviewsCount: number = 1;
    const currentRating = await prisma.userRating.findUnique({
      where: { userId_role: { userId, role } },
    });
    if (currentRating) {
      totalStars = currentRating.totalStars + rating;
      reviewsCount = currentRating.reviewsCount + 1;
      await prisma.userRating.update({
        where: { userId_role: { userId, role } },
        data: { totalStars, reviewsCount },
      });
    } else {
      await prisma.userRating.create({
        data: { userId, role, totalStars, reviewsCount },
      });
    }
    await prisma.$executeRaw`COMMIT TRANSACTION`;

    const cacheKey = `userRating:${userId}:${role}`;
    await redisClient.set(cacheKey, JSON.stringify({ totalStars, reviewsCount }), 'EX', 60 * 60);
    console.log(`Updated rating for user ${userId} (${role})`);
  } catch (error) {
    await prisma.$executeRaw`ROLLBACK TRANSACTION`;
    console.error('Failed to update user rating', error);
  }
};

export default processUserRating;
