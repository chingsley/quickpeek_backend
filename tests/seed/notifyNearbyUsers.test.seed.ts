import { PrismaClient } from '@prisma/client';
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

// const prisma = new PrismaClient();

const seedTestData = async (prisma: PrismaClient) => {
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

      const user = await prisma.user.create({
        data: {
          email: `test${i + 1}@quickpeek.com`,
          password: 'hashed_password', // Use a secure hashed password in real scenarios
          name: faker.person.firstName() + ' ' + faker.person.lastName(),
          username: faker.internet.userName(),
          deviceType: i % 2 === 0 ? 'ios' : 'android',
          deviceToken: faker.string.uuid(),
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
  await Promise.all(
    Array.from({ length: 5 }, async (_, i) => {
      // Generate random locations within a 5 km radius for the questions
      const questionLocation = generateRandomLocationWithinRadius(centralLongitude, centralLatitude, 5);

      await prisma.question.create({
        data: {
          userId: users[i].id,  // Associate each question with one of the users
          title: `Question ${i + 1}`,
          content: `Question content ${i + 1}`,
          location: `${questionLocation.longitude}, ${questionLocation.latitude}`,
        },
      });
    })
  );
};

// seedTestData()
//   .then(async () => {
//     console.log('Test data seeded successfully.');
//     await prisma.$disconnect();
//   })
//   .catch(async (e) => {
//     console.error('Error seeding test data:', e);
//     await prisma.$disconnect();
//     process.exit(1);
//   });

export default seedTestData;
