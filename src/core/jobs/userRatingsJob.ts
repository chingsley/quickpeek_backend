import { Job } from 'bull';
import prisma from '../database/prisma/client';

const processUserRating = async (job: Job) => {
  // console.log('\n....... execution job.....\n', job);
  try {
    const { userId, rating } = job.data;

    await prisma.$executeRaw`BEGIN TRANSACTION`;
    const currentRating = await prisma.userRating.findUnique({ where: { userId } });
    if (!currentRating) {
      await prisma.userRating.create({
        data: { userId, totalRating: rating, answersCount: 1 }
      });
      return;
    }

    const totalRating = currentRating.totalRating + rating;
    const answersCount = currentRating.answersCount + 1;
    await prisma.userRating.update({
      where: { userId },
      data: { totalRating, answersCount }
    });
    await prisma.$executeRaw`COMMIT TRANSACTION`;
    console.log(`Updated rating for user ${userId}`);
  } catch (error) {
    await prisma.$executeRaw`ROLLBACK TRANSACTION`;
    console.error('Failed to update user rating', error);
  }
};

export default processUserRating;
