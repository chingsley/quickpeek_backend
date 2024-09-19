import { PrismaClient, Question, User } from '@prisma/client';
import { Job } from 'bull';
import prisma from '../database/prisma/client';
import { sendNotification } from '../messaging/firebase.push';

type QuestionWithUser = Question & {
  user: {
    deviceToken: string;
    deviceType: string;
    notificationsEnabled: string;
  };
};

export const sendAnswerToQuestioner = async (job: Job) => {
  try {
    const { questionId, answerContent, responderId } = job.data;

    const responder = await prisma.user.findUnique({ where: { id: responderId } });
    if (!responder) throw Error(`Responder with id: ${responderId} not found`);

    const question = await prisma.question.findUnique({
      where: {
        id: questionId,
      },
      include: {
        user: {
          select: {
            deviceToken: true,
            deviceType: true,
            notificationsEnabled: true
          },
        },
      },
    }) as QuestionWithUser | null;
    if (!question || !question.user) {
      throw new Error('Question or associated user not found');
    }

    const { user } = question;
    if (!user.notificationsEnabled) return;

    const payload = {
      title: `Answer: ${question.title}`,
      body: answerContent,
      data: {
        questionId,
        responderId,
        responderUsername: responder.username,
        // responderRatings: responder.ratings.value // include responder rating here
      }
    };
    await sendNotification(user.deviceToken, payload);
  } catch (error) {
    console.error('Failed to send question to nearby users', error);
  }
};


// Function to find users within x kilometers radius from the given location using the Haversine formula in SQL
// The Haversine formula works with distances in kilometers since it uses the Earth's radius in kilometers (6371 km);
export async function findNearbyUsers(prisma: PrismaClient, longitude: number, latitude: number, radiusInKm: number) {
  const nearbyUsers = await prisma.$queryRaw<{ userId: string; latitude: number; longitude: number; distance: number; deviceType: string; deviceToken: string; notificationsEnabled: boolean; }[]>`
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




export default sendAnswerToQuestioner;