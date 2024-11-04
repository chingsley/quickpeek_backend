import { Job } from 'bull';
import prisma from '../database/prisma/client';

const processDeviceUpdate = async (job: Job) => {
  const { userId, deviceType, deviceToken, notificationsEnabled,
    locationSharingEnabled } = job.data;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { deviceType, deviceToken, notificationsEnabled, locationSharingEnabled },
    });

    console.log(`Updated device info for user ${userId}`);
  } catch (error) {
    console.error('Failed to update device info', error);
  }
};

export default processDeviceUpdate;
