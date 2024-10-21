import { Job } from 'bull';
import prisma from '../database/prisma/client';

const processUserLocationUpdate = async (job: Job) => {
  const { userId, longitude, latitude } = job.data;

  try {
    await prisma.location.upsert({
      where: {
        userId,
      },
      update: {
        longitude,
        latitude,
      },
      create: {
        longitude,
        latitude,
        userId,
      },
    });

    console.log(`Updated location for user ${userId}`);
  } catch (error) {
    console.error('Failed to update user location', error);
  }
};

export default processUserLocationUpdate;
