import { PrismaClient } from '@prisma/client';

const clearAllSeed = async (prisma: PrismaClient) => {
  await prisma.answerRating.deleteMany({});
  await prisma.answer.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.userRating.deleteMany({});
  await prisma.user.deleteMany({});
};



export default clearAllSeed;