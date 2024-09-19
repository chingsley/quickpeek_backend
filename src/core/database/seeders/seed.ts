import { PrismaClient, Question } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';

// Function to generate random coordinates within a certain radius (in km) around a central point
const generateRandomLocationWithinRadius = (longitude: number, latitude: number, radiusInKm: number) => {
  const radiusInDegrees = radiusInKm / 111; // Approximate conversion from kilometers to degrees
  const randomOffset = () => (Math.random() - 0.5) * 2 * radiusInDegrees;

  return {
    longitude: longitude + randomOffset(),
    latitude: latitude + randomOffset(),
  };
};

const prisma = new PrismaClient();

const seedTestData = async () => {
  // Clear existing data
  await prisma.rating.deleteMany({});
  await prisma.answer.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.user.deleteMany({});

  // Create a central point for the questions to be close to
  const centralLongitude = parseFloat(`${faker.location.longitude()}`);
  const centralLatitude = parseFloat(`${faker.location.latitude()}`);

  // Create 50 users with locations around the central point
  const users = await Promise.all(
    Array.from({ length: 50 }, async (_, i) => {
      // Generate random locations around the central point, within a 20 km radius
      const userLocation = generateRandomLocationWithinRadius(centralLongitude, centralLatitude, 20);
      const email = `test${i + 1}@quickpeek.com`;
      const password = await bcrypt.hash(email, 10); // each user's email is their password

      const user = await prisma.user.create({
        data: {
          email,
          password,
          name: faker.person.firstName() + ' ' + faker.person.lastName(),
          username: faker.internet.userName(),
          deviceType: i % 2 === 0 ? 'ios' : 'android',
          deviceToken: faker.string.uuid(),
          notificationsEnabled: true,
          location: {
            create: {
              longitude: userLocation.longitude,
              latitude: userLocation.latitude,
            },
          },
        },
      });
      return user;
    })
  );

  // Create 5 questions with locations around the central point
  const questions = await Promise.all(
    Array.from({ length: 5 }, async (_, i) => {
      // Generate random locations within a 5 km radius for the questions
      const questionLocation = generateRandomLocationWithinRadius(centralLongitude, centralLatitude, 5);

      const question = await prisma.question.create({
        data: {
          userId: users[i].id,  // Associate each question with one of the first 5 users
          title: `Question ${i + 1}`,
          content: `Question content ${i + 1}`,
          location: `${questionLocation.longitude}, ${questionLocation.latitude}`,
        },
      });
      return question;
    })
  );

  // Create 10 answers (twice the question number), two for each question
  const dict: { [key: number]: boolean; } = {};
  const answers = await Promise.all(
    Array.from({ length: questions.length * 2 }, async (_, i) => {
      const qnIdx = i % questions.length;
      const answerIdx = dict[qnIdx] ? 2 : 1;
      dict[qnIdx] = true;
      const answer = await prisma.answer.create({
        data: {
          questionId: questions[qnIdx].id,
          content: `answer ${answerIdx} to question ${qnIdx}`,
          userId: users[i + 5].id,
        },
      });
      return answer;
    })
  );

  // Create 10 ratings, correspoinding to each answer
  await Promise.all(
    Array.from({ length: answers.length }, async (_, i) => {
      const question = questions[i % questions.length];
      const rating = await prisma.rating.create({
        data: {
          questionId: question.id,
          questionerId: question.userId, // rater
          responderId: answers[i].userId,    // ratee
          rating: faker.number.int({ min: 1, max: 5 }), // Generate a random rating between 1 and 5
          feedback: faker.string.alpha({ length: 20 }) // Generate random 20 character string
        },
      });
      return rating;
    })
  );
};

seedTestData()
  .then(async () => {
    console.log('Test data seeded successfully.');
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error seeding test data:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
