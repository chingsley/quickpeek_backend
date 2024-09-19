import { faker } from '@faker-js/faker';
import { Question, User } from '@prisma/client';
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
  describe('Answer Question (POST /api/v1/questions/:questionId/answer)', () => {
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
          questionId: question.id,
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
        Array.from(['questionId', 'content'], async field => {
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
});
