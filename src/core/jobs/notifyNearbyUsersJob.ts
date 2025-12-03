// src / core / jobs / notifyNearbyUsersJob.ts

import { TQuestion } from './../../types/question.types';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bull';
import prisma from '../database/prisma/client';
import { sendNotification } from '../messaging/firebase.push';
import { io } from '../socket/socket.server';

export const notifyNearbyUsers = async (job: Job) => {
  try {
    const radiusInKm = parseFloat(process.env.RADIUS_OF_CONCERN_IN_KM || '3');
    const { question } = job.data as { question: TQuestion; };
    const nearbyUsers = await findNearbyUsers(prisma, question.longitude, question.latitude, radiusInKm);
    console.log({ "TO_REMOVE: nearbyUsers": nearbyUsers });
    if (nearbyUsers.length === 0) return;

    await Promise.all(
      nearbyUsers.map(async (user) => {
        // TODO: Remove this comment to avoid notifying users about their own questions
        // if (user.userId === question.userId) return; // Do not notify a user about their own question

        // SOCKET EMIT: Send to the specific user's room
        // We use the "user:UUID" room pattern we set up in socket.server.ts
        if (io) {
          io.to(`user:${user.userId}`).emit('question:new', {
            id: question.id,
            address: question.address,
            longitude: question.longitude,
            latitude: question.latitude,
            text: question.text,
            userId: question.userId,
            createdAt: question.createdAt,
            updatedAt: question.updatedAt,
            status: question.status, // Should be 'OPEN',
          });
        }

        console.log('Active socket connections:', io?.engine?.clientsCount);
        if (!user.notificationsEnabled) return;  // Skip if notifications are disabled
        const payload = {
          body: question.text,
          data: {
            questionId: question.id,
            questionAddress: question.address,
          },
        };

        // await sendNotification(user.deviceToken, payload);

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
  const nearbyUsers = await prisma.$queryRaw<{ userId: string; latitude: number; longitude: number; distance: number; deviceType: string; deviceToken: string; notificationsEnabled: boolean; email: string; }[]>`
  SELECT calculated_distances."userId", calculated_distances.longitude, calculated_distances.latitude, calculated_distances.distance, users."deviceType", users."deviceToken", users."notificationsEnabled", users."email"
  FROM (
    SELECT "userId", longitude, latitude,
          (6371 * acos(
              cos(radians(44.6126388)) 
              * cos(radians(latitude)) 
              * cos(radians(longitude) - radians(-63.6192829)) 
              + sin(radians(44.6126388)) * sin(radians(latitude))
          )) AS distance
    FROM locations
  ) AS calculated_distances
  JOIN users
  ON users.id = calculated_distances."userId" AND users.email IN ('test03@quickpeek.com', 'test02@quickpeek.com')
  --WHERE distance <= 10
  ORDER BY distance;
`;

  // `
  //   SELECT calculated_distances."userId", calculated_distances.longitude, calculated_distances.latitude, calculated_distances.distance, users."deviceType", users."deviceToken", users."notificationsEnabled", users."email"
  //   FROM (
  //     SELECT "userId", longitude, latitude,
  //           (6371 * acos(
  //               cos(radians(${latitude})) 
  //               * cos(radians(latitude)) 
  //               * cos(radians(longitude) - radians(${longitude})) 
  //               + sin(radians(${latitude})) * sin(radians(latitude))
  //           )) AS distance
  //     FROM locations
  //   ) AS calculated_distances
  //   JOIN users
  //   ON users.id = calculated_distances."userId"
  //   WHERE distance <= ${radiusInKm}
  //   ORDER BY distance;
  // `;

  return nearbyUsers;
}




export default notifyNearbyUsers;