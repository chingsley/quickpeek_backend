import { Job } from 'bull';
import prisma from '../database/prisma/client';

const processDeviceUpdate = async (job: Job) => {
  const { userId, deviceType, deviceToken, notificationsEnabled,
    locationSharingEnabled } = job.data;

  try {
    await prisma.user.update({
      where: { id: userId },
      // Only write fields the client actually sent — a login that omits
      // locationSharingEnabled must not clobber the stored preference.
      data: {
        ...(deviceType !== undefined ? { deviceType } : {}),
        ...(deviceToken !== undefined ? { deviceToken } : {}),
        ...(notificationsEnabled !== undefined ? { notificationsEnabled } : {}),
        ...(locationSharingEnabled !== undefined ? { locationSharingEnabled } : {}),
      },
    });

    console.log(`Updated device info for user ${userId}`);
  } catch (error) {
    console.error('Failed to update device info', error);
  }
};

export default processDeviceUpdate;
