import { PrismaClient, Question, User } from '@prisma/client';
import { Job } from 'bull';
import prisma from '../database/prisma/client';

export const notifyNearbyUsers = async (job: Job) => {
  try {
    const radiusInKm = parseFloat(process.env.RADIUS_OF_CONCERN_IN_KM || '3');
    const { questionId, questionLon, questionLat, questionerId, questionTitle, questionContent } = job.data;
    const nearbyUsers = await findNearbyUsers(prisma, questionLon, questionLat, radiusInKm);
    if (nearbyUsers.length === 0) return;

    await Promise.all(
      nearbyUsers.map(async (user) => {
        if (user.userId !== questionerId) { // Do not notify the user about their own question
          await sendNotification({
            deviceToken: user.deviceToken,
            deviceType: user.deviceType,
            questionId,
            questionTitle,
            questionContent,
            questionerId,
          });
        }
      })
    );

    console.log(`Question sent to ${nearbyUsers.length} nearby users`);
  } catch (error) {
    console.error('Failed to send question to nearby users', error);
  }
};


// Function to find users within x kilometers radius from the given location using the Haversine formula in SQL
// The Haversine formula works with distances in kilometers since it uses the Earth's radius in kilometers (6371 km);
export async function findNearbyUsers(prisma: PrismaClient, longitude: number, latitude: number, radiusInKm: number) {
  const nearbyUsers = await prisma.$queryRaw<{ userId: string; latitude: number; longitude: number; distance: number; deviceType: string; deviceToken: string; }[]>`
    SELECT calculated_distances."userId", calculated_distances.longitude, calculated_distances.latitude, calculated_distances.distance, users."deviceType", users."deviceToken"
    FROM (
      SELECT "userId", longitude, latitude,
            (6371 * acos(
                cos(radians(${latitude})) 
                * cos(radians(latitude)) 
                * cos(radians(longitude) - radians(${longitude})) 
                + sin(radians(${latitude})) * sin(radians(latitude))
            )) AS distance
      FROM locations
    ) AS calculated_distances
    JOIN users
    ON users.id = calculated_distances."userId"
    WHERE distance <= ${radiusInKm}
    ORDER BY distance;
  `;

  return nearbyUsers;
}

export async function sendNotification({
  deviceToken,
  deviceType,
  questionId,
  questionTitle,
  questionContent,
  questionerId
}: {
  deviceToken: string;
  deviceType: string;
  questionId: string;
  questionTitle: string;
  questionContent: string;
  questionerId: string;
}) {
  // implement notification sending...
  console.log('\nsending notification....', questionId, '....\n');
}


export default notifyNearbyUsers;