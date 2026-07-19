import { PrismaClient } from '@prisma/client';
import prisma from '../../src/core/database/prisma/client';

/**
 * Wipes all rows in dependency order. New tables added during the
 * marketplace revision should be appended here so every test file
 * starts from the same empty baseline.
 */
export const clearDatabase = async (client: PrismaClient = prisma) => {
  await client.message.deleteMany({});
  await client.review.deleteMany({});
  await client.questionResponderBlock.deleteMany({});
  await client.answerRequest.deleteMany({});
  await client.question.deleteMany({});
  await client.category.deleteMany({});
  await client.userRating.deleteMany({});
  await client.transaction.deleteMany({});
  await client.location.deleteMany({});
  await client.user.deleteMany({});
};

export default prisma;
