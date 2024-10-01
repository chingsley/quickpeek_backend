import { Answer, Question, User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { Job } from 'bull';
import request from 'supertest';
import { faker } from '@faker-js/faker';
import prisma from "../../../src/core/database/prisma/client";
import app from '../../../src/app';
import clearAllSeed from '../../seed/clear.seed';


import { userRatingsUpdateQueue } from "../../../src/core/queues/userRatingsUpdateQueue";
import { processUserRatings } from '../../../src/core/jobs';

describe('User Ratings', () => {
  describe('POST /ratings', () => {
    var userRatingsUpdateQueueAddMock: jest.SpyInstance;
    var userRatingsUpdateQueueProcessMock: jest.SpyInstance;
    var questionCreator1: User;
    var questionCreator2: User;
    var responder: User;
    var question1: Question;
    var question2: Question;
    var answer1: Answer;
    var answer2: Answer;
    const [RATING_VALUE_1, RATING_VALUE_2] = [3, 4];
    const createMock = async (data: { userId: string; rating: number; }) => {
      userRatingsUpdateQueueAddMock = jest.spyOn(userRatingsUpdateQueue, 'add').mockImplementation(async (data) => {
        // console.log('adding to the queue in test...', data, typeof data);
        await userRatingsUpdateQueue.process(processUserRatings);
        return Promise.resolve({ id: 1, data } as Job);
      });

      userRatingsUpdateQueueProcessMock = jest.spyOn(userRatingsUpdateQueue, 'process').mockImplementation(async () => {
        await processUserRatings({ data: data } as Job); // Return a mock Job object that contains the data
      });
    };

    beforeAll(async () => {
      await clearAllSeed(prisma);

      // 2 question creators, 1 responder (will respond to the 2 questions)
      [questionCreator1, questionCreator2, responder] = await Promise.all(
        Array.from(['t1@gmail.com', 't2@gmail.com', 't3@gmail.com'], (email) => prisma.user.create({
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

      // 2 questions, one for each question creator
      [question1, question2] = await Promise.all(
        Array.from([questionCreator1, questionCreator2], (questionCreator, i) => prisma.question.create({
          data: {
            userId: questionCreator.id,
            title: `question ${i + 1} title`,
            content: `question ${i + 1} content`,
            location: `${faker.location.longitude()}, ${faker.location.latitude()}`
          }
        })
        ));

      // 2 answers (one for each question), by the same responder
      [answer1, answer2] = await Promise.all(
        Array.from([question1, question2], (question, i) => prisma.answer.create({
          data: {
            userId: responder.id,
            questionId: question.id,
            content: `answer to question ${i + 1}`,
          }
        }))
      );
    });

    afterAll(async () => {
      await prisma.$disconnect();
      userRatingsUpdateQueueAddMock.mockReset();
      userRatingsUpdateQueueAddMock.mockRestore();  // Restore original add method after tests
      userRatingsUpdateQueueProcessMock.mockReset();
      userRatingsUpdateQueueProcessMock.mockRestore();  // Restore original process method after tests
    });

    it('should send the location update to the queue and process it', async () => {
      await createMock({
        userId: responder.id,
        rating: RATING_VALUE_1,
      });

      const token = jwt.sign({ userId: questionCreator1.id }, process.env.JWT_SECRET!); // Mock JWT token generation
      const response = await request(app)
        .post('/api/v1/ratings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          answerId: answer1.id,
          rating: RATING_VALUE_1,
          feedback: faker.string.alpha({ length: 20 }),
        });
      expect(response.body.data).toHaveProperty('answerId', answer1.id);
      expect(response.body.data).toHaveProperty('rating', RATING_VALUE_1);

      const userRating = await prisma.userRating.findUnique({ where: { userId: responder.id } });
      expect(userRating).not.toBe(null);
      expect(userRating!.userId).toEqual(responder.id);
      expect(userRating!.totalRating).toEqual(RATING_VALUE_1);
      expect(userRating!.answersCount).toEqual(1);
    });
    it('Should update user rating accordingly', async () => {
      await createMock({
        userId: responder.id,
        rating: RATING_VALUE_2,
      });

      const token = jwt.sign({ userId: questionCreator2.id }, process.env.JWT_SECRET!); // Mock JWT token generation
      const response = await request(app)
        .post('/api/v1/ratings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          answerId: answer2.id,
          rating: RATING_VALUE_2,
          feedback: faker.string.alpha({ length: 20 }),
        });

      expect(response.body.data).toHaveProperty('answerId', answer2.id);
      expect(response.body.data).toHaveProperty('rating', RATING_VALUE_2);

      const userRating = await prisma.userRating.findUnique({ where: { userId: responder.id } });
      expect(userRating).not.toBe(null);
      expect(userRating!.userId).toEqual(responder.id);
      expect(userRating!.totalRating).toEqual(RATING_VALUE_1 + RATING_VALUE_2);
      expect(userRating!.answersCount).toEqual(2);
    });
  });
});