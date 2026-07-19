import { PrismaClient } from '@prisma/client';

/**
 * Wipes all rows from every table in dependency order.
 * Intended to run inside a wrapped transaction in beforeAll hooks
 * so each test file starts from a known-empty state.
 */
const clearAllSeed = async (prisma: PrismaClient) => {
  await prisma.message.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.userRating.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.user.deleteMany({});
};

export default clearAllSeed;
