import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  await prisma.rating.deleteMany({});
  await prisma.answer.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.user.deleteMany({});
  // Seed Locations
  const location1 = await prisma.location.create({
    data: {
      id: uuidv4(),
      name: 'Main Street',
      latitude: 34.0522,
      longitude: -118.2437,
    },
  });

  const location2 = await prisma.location.create({
    data: {
      id: uuidv4(),
      name: 'Second Avenue',
      latitude: 40.7128,
      longitude: -74.0060,
    },
  });

  // Seed Users
  const user1 = await prisma.user.create({
    data: {
      id: uuidv4(),
      name: 'john doe',
      email: 'john.doe@example.com',
      password: 'password123',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      id: uuidv4(),
      name: 'jane doe',
      email: 'jane.doe@example.com',
      password: 'password456',
    },
  });

  // Seed Questions
  const question1 = await prisma.question.create({
    data: {
      id: uuidv4(),
      title: 'Is the coffee shop open?',
      content: 'Is the coffee shop on Main Street open now?',
      userId: user1.id,
      locationId: location1.id,
    },
  });

  const question2 = await prisma.question.create({
    data: {
      id: uuidv4(),
      title: 'How long is the queue at the bakery?',
      content: 'Can anyone tell me how long the queue is at the bakery on Second Avenue?',
      userId: user2.id,
      locationId: location2.id,
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
      value: 5,
      userId: user1.id,
      questionId: question1.id,
      answerId: answer1.id,
    },
  });

  const rating2 = await prisma.rating.create({
    data: {
      id: uuidv4(),
      value: 4,
      userId: user2.id,
      questionId: question2.id,
      answerId: answer2.id,
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
