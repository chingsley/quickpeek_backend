import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.rating.deleteMany({});
  await prisma.answer.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.user.deleteMany({});

  // Seed Users
  const user1 = await prisma.user.create({
    data: {
      id: uuidv4(),
      name: 'john doe',
      username: 'johnD',
      email: 'john.doe@example.com',
      password: await bcrypt.hash('password1', 10),
      deviceType: 'ios',
    },
  });
  const user2 = await prisma.user.create({
    data: {
      id: uuidv4(),
      name: 'jane doe',
      username: 'janeD',
      email: 'jane.doe@example.com',
      password: await bcrypt.hash('password1', 10),
      deviceType: 'android',
    },
  });

  // Seed User Locations
  const location1 = await prisma.location.create({
    data: {
      id: uuidv4(),
      userId: user1.id,
      latitude: 34.0522,
      longitude: -118.2437,
    },
  });
  const location2 = await prisma.location.create({
    data: {
      id: uuidv4(),
      userId: user2.id,
      latitude: 40.7128,
      longitude: -74.0060,
    },
  });

  // Seed Questions
  const question1 = await prisma.question.create({
    data: {
      id: uuidv4(),
      title: 'Is the coffee shop open?',
      content: 'Is the coffee shop on Main Street open now?',
      userId: user1.id,
      location: '41.40338, 2.17403',
    },
  });
  const question2 = await prisma.question.create({
    data: {
      id: uuidv4(),
      title: 'How long is the queue at the bakery?',
      content: 'Can anyone tell me how long the queue is at the bakery on Second Avenue?',
      userId: user2.id,
      location: '34.0522, -70.0060',
    },
  });

  // Seed Answers
  const answer1 = await prisma.answer.create({
    data: {
      id: uuidv4(),
      content: 'Yes, the coffee shop is open.',
      questionId: question1.id,
      userId: user2.id,
    },
  });
  const answer2 = await prisma.answer.create({
    data: {
      id: uuidv4(),
      content: 'The queue at the bakery is around 15 minutes.',
      questionId: question2.id,
      userId: user1.id,
    },
  });

  // Seed Ratings
  const rating1 = await prisma.rating.create({
    data: {
      id: uuidv4(),
      rating: 5,
      questionerId: user1.id,
      responderId: user2.id,
      questionId: question1.id,
    },
  });
  const rating2 = await prisma.rating.create({
    data: {
      id: uuidv4(),
      rating: 2,
      questionerId: user2.id,
      responderId: user1.id,
      questionId: question2.id,
      feedback: 'told me the queue was too long. Other answers said there was no queue. I went anyway and found no queue',
    },
  });

  console.log('Database has been seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
