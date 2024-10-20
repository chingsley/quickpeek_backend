import { faker } from '@faker-js/faker';
import { Answer, Question, User, UserRating } from '@prisma/client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/core/database/prisma/client';
import clearSeedAll from '../../seed/clear.seed';

describe('questions', () => {
  describe('Question Creation Endpoint (POST /api/v1/questions)', () => {
    let token: string;
    let testUser: User;



    beforeAll(async () => {
      await clearSeedAll(prisma);

      // Seed the test database with a user for authentication
      testUser = await prisma.user.create({
        data: {
          email: 'testuser@example.com',
          password: 'hashedpassword', // Assume this is already hashed
          name: 'Test User',
          username: 'testuser',
          deviceType: 'ios',
          deviceToken: 'someDeviceToken',
          notificationsEnabled: true,
        },
      });

      // Generate JWT token for the user
      token = jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET!);
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(async () => {
      await prisma.$executeRaw`BEGIN TRANSACTION`;
    });

    afterEach(async () => {
      await prisma.$executeRaw`ROLLBACK TRANSACTION`;
    });

    test('should create a question successfully with valid data and token', async () => {
      const questionData = {
        title: 'Where can I find a good cafe?',
        content: 'Looking for a nice place to work in downtown.',
        location: '40.730610, -73.935242', // Example lat, long
      };

      const response = await request(app)
        .post('/api/v1/questions')
        .set('Authorization', `Bearer ${token}`)
        .send(questionData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Question created successfully');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toMatchObject({
        title: questionData.title,
        content: questionData.content,
        location: questionData.location,
        userId: testUser.id,
      });
    });

    test('should return 400 when required fields are missing', async () => {
      const invalidData = {
        title: 'Test missing content', // Missing content and location
      };

      const response = await request(app)
        .post('/api/v1/questions')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('"content" is required');
    });

    test('should return 401 when no token is provided', async () => {
      const questionData = {
        title: 'Where can I find a good cafe?',
        content: 'Looking for a nice place to work in downtown.',
        location: '40.730610, -73.935242',
      };

      const response = await request(app)
        .post('/api/v1/questions')
        .send(questionData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access denied, no token provided');
    });

    test('should return 400 when an invalid token is provided', async () => {
      const questionData = {
        title: 'Where can I find a good cafe?',
        content: 'Looking for a nice place to work in downtown.',
        location: '40.730610, -73.935242',
      };

      const response = await request(app)
        .post('/api/v1/questions')
        .set('Authorization', 'Bearer invalidtoken')
        .send(questionData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });
  });
  describe('Get user"s questions (GET /api/v1/questions)', () => {
    let user1Token: string;
    let user2Token: string;
    let testUser1: any;
    let testUser2: any;

    beforeAll(async () => {
      await clearSeedAll(prisma);
      // seed two users
      [testUser1, testUser2] = await Promise.all(
        Array.from({ length: 2 }, async (_, i) => {
          const user = await prisma.user.create({
            data: {
              email: `testuser${i + 1}@example.com`,
              password: 'hashedpassword', // Assume this is already hashed
              name: `Test User ${i + 1}`,
              username: `testuser ${i + 1}`,
              deviceType: i % 2 === 0 ? 'ios' : 'android',
              deviceToken: 'someDeviceToken',
              notificationsEnabled: true,
              location: {
                create: {
                  longitude: faker.location.longitude(),
                  latitude: faker.location.latitude(),
                }
              }
            }
          });
          return user;
        })
      );

      // seed two questions per user
      await Promise.all(
        Array.from({ length: 4 }, async (_, i) => {
          await prisma.question.create({
            data: {
              userId: i < 2 ? testUser1.id : testUser2.id,  // Associate each question with one of the users
              title: `Question ${i + 1}`,
              content: `Question content ${i + 1}`,
              location: `${faker.location.longitude()}, ${faker.location.latitude()}`,
            },
          });
        })
      );

      // Generate JWT token fot the two users:
      user1Token = jwt.sign({ userId: testUser1.id }, process.env.JWT_SECRET!);
      user2Token = jwt.sign({ userId: testUser2.id }, process.env.JWT_SECRET!);
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(async () => {
      await prisma.$executeRaw`BEGIN TRANSACTION`;
    });

    afterEach(async () => {
      await prisma.$executeRaw`ROLLBACK TRANSACTION`;
    });

    it('should get only questions for testUser1', async () => {
      const response = await request(app)
        .get('/api/v1/questions')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      for (let i = 0; i < 2; i++) {
        expect(response.body.data[i].userId).toEqual(testUser1.id);
      }
    });
    it('should get only questions for testUser2', async () => {
      const response = await request(app)
        .get('/api/v1/questions')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      for (let i = 0; i < 2; i++) {
        expect(response.body.data[i].userId).toEqual(testUser2.id);
      }
    });
    it('should return 401 for invalid user token', async () => {
      const response = await request(app)
        .get('/api/v1/questions')
        .set('Authorization', 'invalidToken');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Invalid token'
      });
    });
  });
  describe('Answer Creation (POST /api/v1/questions/:questionId/answer)', () => {
    let user2Token: string;
    let testUser1: User;
    let testUser2: User;
    let question: Question;

    beforeAll(async () => {
      await clearSeedAll(prisma);
      // seed two users
      [testUser1, testUser2] = await Promise.all(
        Array.from({ length: 2 }, async (_, i) => {
          const user = await prisma.user.create({
            data: {
              email: `testuser${i + 1}@example.com`,
              password: 'hashedpassword', // Assume this is already hashed
              name: `Test User ${i + 1}`,
              username: `testuser ${i + 1}`,
              deviceType: i % 2 === 0 ? 'ios' : 'android',
              deviceToken: 'someDeviceToken',
              notificationsEnabled: true,
              location: {
                create: {
                  longitude: faker.location.longitude(),
                  latitude: faker.location.latitude(),
                }
              }
            }
          });
          return user;
        })
      );

      // seed question for testUser1
      question = await prisma.question.create({
        data: {
          userId: testUser1.id,  // Associate each question with one of the users
          title: 'Queue check',
          content: 'What is the queue size at Oando filling station',
          location: `${faker.location.longitude()}, ${faker.location.latitude()}`,
        },
      });

      // Generate JWT token fot the responser (testUser2):
      user2Token = jwt.sign({ userId: testUser2.id }, process.env.JWT_SECRET!);
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(async () => {
      await prisma.$executeRaw`BEGIN TRANSACTION`;
    });

    afterEach(async () => {
      await prisma.$executeRaw`ROLLBACK TRANSACTION`;
    });

    it('should successfully create an answer', async () => {
      const response = await request(app)
        .post(`/api/v1/questions/${question.id}/answer`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          content: 'about 17 cars'
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
    });
    it('should validate required fields', async () => {
      const payload = {
        questionId: question.id,
        content: 'about 17 cars'
      };
      await Promise.all(
        Array.from(['content'], async field => {
          const response = await request(app)
            .post(`/api/v1/questions/${question.id}/answer`)
            .set('Authorization', `Bearer ${user2Token}`)
            .send({
              ...payload,
              [field]: undefined,
            });

          expect(response.status).toBe(400);
          expect(response.body.error).toEqual(`"${field}" is required`);
        })
      );

    });
  });
  describe('Get Answers to a question (GET /api/v1/questions/:questionId/answers)', () => {
    var questionCreator1: User, questionCreator2: User;
    var responder1: User, responder2: User;
    var question1: Question, question2: Question;
    var token1: any, token2: any;
    beforeAll(async () => {
      await clearSeedAll(prisma);

      [questionCreator1, questionCreator2, responder1, responder2] = await Promise.all(
        Array.from({ length: 4 }, (_, i) => prisma.user.create({
          data: {
            email: `test${i + 1}@gmail.com`,
            password: 'hashedPasswrod',
            name: faker.person.firstName() + ' ' + faker.person.lastName(),
            username: faker.internet.userName(),
            deviceType: 'android',
            deviceToken: faker.string.uuid(),
            notificationsEnabled: true,
          }
        }))
      );

      [question1, question2] = await Promise.all(
        Array.from([questionCreator1, questionCreator2], (qnCreator) => prisma.question.create({
          data: {
            userId: qnCreator.id,
            title: `${qnCreator.username}'s question`,
            content: faker.string.alpha({ length: 40 }),
            location: `${faker.location.longitude()}, ${faker.location.latitude()}`,
          }
        }))
      );

      const answerByAnswerId: { [key: string]: Answer; } = {};
      const answers = await Promise.all(
        Array.from({ length: 4 }, async (_, i) => {
          const question = [question1, question2][i % 2];
          const responders = i < 2 ? [responder1, responder2] : [responder2, responder1];
          const responder = responders[i % 2];
          const answer = await prisma.answer.create({
            data: {
              questionId: question.id,
              content: `${responder.username} answers ${question.title}`,
              userId: responder.id,
            },
          });
          answerByAnswerId[answer.id] = answer;
          return answer;
        })
      );

      const answerRatings = await Promise.all(
        Array.from(answers, async (answer) => prisma.answerRating.create({
          data: {
            answerId: answer.id,
            rating: faker.number.int({ min: 1, max: 5 }),
            feedback: faker.string.alpha({ length: 20 })
          }
        }))
      );

      const userRatingByUserId: { [key: string]: Partial<UserRating>; } = {};
      answerRatings.forEach(ansRating => {
        const userId = answerByAnswerId[ansRating.answerId].userId;
        if (!(userId in userRatingByUserId)) {
          userRatingByUserId[userId] = {
            userId,
            totalRating: 0,
            answersCount: 0
          };
        }
        userRatingByUserId[userId].totalRating = userRatingByUserId[userId].totalRating! + ansRating.rating;
        userRatingByUserId[userId].answersCount = userRatingByUserId[userId].answersCount! + 1;
      });
      await Promise.all(
        Array.from(Object.values(userRatingByUserId), async (userRatingPayload) => prisma.userRating.create({ data: userRatingPayload as UserRating }))
      );

      // Generate JWT token for the user
      token1 = jwt.sign({ userId: questionCreator1.id }, process.env.JWT_SECRET!);
      token2 = jwt.sign({ userId: questionCreator2.id }, process.env.JWT_SECRET!);
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(async () => {
      await prisma.$executeRaw`BEGIN TRANSACTION`;
    });

    afterEach(async () => {
      await prisma.$executeRaw`ROLLBACK TRANSACTION`;
    });

    it('Should return answers to question1, with responders ratings', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${question1.id}/answers`)
        .set('Authorization', `Bearer ${token1}`);

      const { data } = res.body;
      expect(res.status).toBe(200);
      expect(data).toHaveLength(2);
      for (let answer of data) {
        expect(answer.questionId).toBe(question1.id);
        expect(answer.user.userRating).toHaveProperty('totalRating'); //what happens if a user doesn't have ratings yet. Test this case, mabye update the controller to set some default values in such a case
        expect(answer.user.userRating).toHaveProperty('answersCount');
      }
    });
    it('Should return answers to question2, with responders ratings', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${question2.id}/answers`)
        .set('Authorization', `Bearer ${token2}`);

      const { data } = res.body;
      expect(res.status).toBe(200);
      expect(data).toHaveLength(2);
      for (let answer of data) {
        expect(answer.questionId).toBe(question2.id);
        expect(answer.user.userRating).toHaveProperty('totalRating'); //what happens if a user doesn't have ratings yet. Test this case, mabye update the controller to set some default values in such a case
        expect(answer.user.userRating).toHaveProperty('answersCount');
      }
    });
    it('Should return empty array if question id does not belong to user (test with questionCreator1)', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${question2.id}/answers`) // requesting question2 with token1 returns [ ]
        .set('Authorization', `Bearer ${token1}`);

      const { data } = res.body;
      expect(res.status).toBe(200);
      expect(data).toHaveLength(0);
    });
    it('Should return empty array if question id does not belong to user (test with questionCreator2)', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${question1.id}/answers`) // requesting question2 with token1 returns [ ]
        .set('Authorization', `Bearer ${token2}`);

      const { data } = res.body;
      expect(res.status).toBe(200);
      expect(data).toHaveLength(0);
    });
  });
});
