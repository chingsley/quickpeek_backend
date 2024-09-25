import jwt from 'jsonwebtoken';
import { Job } from 'bull';
import request from 'supertest';
import { faker } from '@faker-js/faker';
import prisma from "../../../src/core/database/prisma/client";
import app from '../../../src/app';
import clearAllSeed from '../../seed/clear.seed';


import { userRatingsUpdateQueue } from "../../../src/core/queues/userRatingsUpdateQueue";
import { processUserRatings } from '../../../src/core/jobs';


describe('userRatingsJob', () => {
  var userRatingsUpdateQueueAddMock: jest.SpyInstance;
  var userRatingsUpdateQueueProcessMock: jest.SpyInstance;
  const createMock = async (data: { userId: string; rating: number; }) => {
    userRatingsUpdateQueueAddMock = jest.spyOn(userRatingsUpdateQueue, 'add').mockImplementation(async (data) => {
      // console.log('adding to the queue in test...', data, typeof data);
      // Return a mock Job object that contains the data
      const mockJob: Partial<Job> = {
        id: 1,
        data
      };

      await userRatingsUpdateQueue.process(processUserRatings);
      return Promise.resolve(mockJob as Job);
    });

    userRatingsUpdateQueueProcessMock = jest.spyOn(userRatingsUpdateQueue, 'process').mockImplementation(async () => {
      const mockJob = { data: data } as Job;
      await processUserRatings(mockJob);
    });
  };

  beforeAll(async () => {
    await clearAllSeed(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    userRatingsUpdateQueueAddMock.mockReset();
    userRatingsUpdateQueueAddMock.mockRestore();  // Restore original add method after tests
    userRatingsUpdateQueueProcessMock.mockReset();
    userRatingsUpdateQueueProcessMock.mockRestore();  // Restore original process method after tests
  });

  it('should send the location update to the queue and process it', async () => {
    const [questionCreator, responder] = await Promise.all(
      Array.from(['t1@gmail.com', 't2@gmail.com'], async (email) => prisma.user.create({
        data: {
          email,
          password: 'hashedPasswrod',
          name: faker.person.firstName() + ' ' + faker.person.lastName(),
          username: faker.internet.userName(),
          deviceType: 'android',
          deviceToken: faker.string.uuid(),
          notificationsEnabled: true,
        }
      }))
    );
    const question = await prisma.question.create({
      data: {
        userId: questionCreator.id,
        title: 'title - testing Ratings',
        content: 'content - testing ratings',
        location: `${faker.location.longitude()}, ${faker.location.latitude()}`
      }
    });
    const answer = await prisma.answer.create({
      data: {
        userId: responder.id,
        questionId: question.id,
        content: 'answer to ratings test',
      }
    });

    const RATING_VALUE = 4;

    await createMock({
      userId: responder.id,
      rating: RATING_VALUE,
    });

    const token = jwt.sign({ userId: questionCreator.id }, process.env.JWT_SECRET!); // Mock JWT token generation
    const response = await request(app)
      .post('/api/v1/ratings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        answerId: answer.id,
        rating: RATING_VALUE,
        feedback: faker.string.alpha({ length: 20 }),
      });
    expect(response.status).toBe(201);
    expect(response.body.data).toHaveProperty('answerId', answer.id);
    expect(response.body.data).toHaveProperty('rating', RATING_VALUE);

    const userRating = await prisma.userRating.findUnique({ where: { userId: responder.id } });
    expect(userRating).not.toBe(null);
    expect(userRating!.userId).toEqual(responder.id);
    expect(userRating!.totalRating).toEqual(RATING_VALUE);
    expect(userRating!.answersCount).toEqual(1);

  });
});