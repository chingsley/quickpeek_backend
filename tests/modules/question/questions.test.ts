import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/core/database/prisma/client';
import jwt from 'jsonwebtoken';
import clearSeed from '../../seed/clear.seed';

describe('Question Creation Endpoint (/api/v1/questions)', () => {
  let token: string;
  let testUser: any;



  beforeAll(async () => {
    await clearSeed(prisma);

    // Seed the test database with a user for authentication
    testUser = await prisma.user.create({
      data: {
        email: 'testuser@example.com',
        password: 'hashedpassword', // Assume this is already hashed
        name: 'Test User',
        username: 'testuser',
        deviceType: 'ios',
        deviceToken: 'someDeviceToken',
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

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid token');
  });
});
