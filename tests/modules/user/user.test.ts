import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Job } from 'bull';
import request from 'supertest';
import { faker } from '@faker-js/faker';
import { TokenPayload } from './../../../src/common/types/index';
import prisma from "../../../src/core/database/prisma/client";
import app from '../../../src/app';
import clearAllSeed from '../../seed/clear.seed';
import { userLocationUpdateQueue } from '../../../src/core/queues/userLocationUpdateQueue';
import { deviceUpdateQueue } from '../../../src/core/queues/deviceUpdateQueue';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';



describe('Users', () => {
  describe('User Registration (POST /api/v1/users/register)', () => {
    const userData = {
      email: 'testuser@example.com',
      password: 'hashedpassword', // Assume this is already hashed
      name: 'Test User',
      username: 'testuser',
      deviceType: 'ios',
      deviceToken: 'someDeviceToken',
    };

    const userPayload = {
      ...userData,
      longitude: faker.location.longitude(),
      latitude: faker.location.latitude(),
    };

    beforeAll(async () => {
      await clearAllSeed(prisma);
      await prisma.location.deleteMany({});
      await prisma.user.deleteMany({});
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

    it('should create a user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .send(userPayload);

      expect(res.status).toBe(201);
      const { user: createdUser, location: userLocation } = res.body.data;
      expect(createdUser).toHaveProperty('id');
      expect(createdUser.email).toEqual(userPayload.email);
      expect(userLocation.userId).toEqual(createdUser.id);
      expect(userLocation.longitude).toEqual(userPayload.longitude);
      expect(userLocation.latitude).toEqual(userPayload.latitude);
    });
    it('should validate unique email', async () => {
      await prisma.user.create({ data: userData });
      const res = await request(app)
        .post('/api/v1/users')
        .send(userPayload);
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual('Email is already in use');
      expect(true).toBe(true);
    });
    it('should validate unique username', async () => {
      await prisma.user.create({ data: userData });
      const res = await request(app)
        .post('/api/v1/users')
        .send({
          ...userPayload,
          email: 'different@mail.com' // different email, same username
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual('Username is already taken');
      expect(true).toBe(true);
    });
    it('should should validate required fields', async () => {
      const requiredFields = ['email', 'password', 'name', 'username', 'deviceType', 'deviceToken'];
      await Promise.all(
        Array.from(requiredFields, async (field) => {
          const res = await request(app)
            .post('/api/v1/users')
            .send({
              ...userPayload,
              [field]: undefined // remove each required field to test
            });
          expect(res.status).toBe(400);
          expect(res.body.error).toEqual(`"${field}" is required`);
          expect(true).toBe(true);
        })
      );
    });
  });
  describe('User Login (POST /api/v1/users/login)', () => {
    let hashedPassword: string;
    const userData = {
      email: 'testuser@example.com',
      // password: hashedPassword, // password is hashed and passed in each 'it' block
      name: 'Test User',
      username: 'testuser',
      deviceType: 'ios',
      deviceToken: 'someDeviceToken',
    };

    const loginPayload = {
      email: userData.email,
      password: 'testUserPass',
      deviceType: 'android',
      deviceToken: 'someDiveToken'
    };

    const deviceUpdateQueueAddMock = jest.spyOn(deviceUpdateQueue, 'add').mockImplementation((data) => {
      // console.log('adding to the queue in test...', data, typeof data);
      // Return a mock Job object that contains the data
      const mockJob: Partial<Job> = {
        id: 1,
        data
      };

      deviceUpdateQueue.process(() => { });
      return Promise.resolve(mockJob as Job);
    });

    const deviceUpdateQueueProcessMock = jest.spyOn(deviceUpdateQueue, 'process').mockImplementation(async (job) => {
      // console.log('processing job in test, updating location...', job, typeof job);
      return Promise.resolve();
    });

    beforeAll(async () => {
      await clearAllSeed(prisma);
      await prisma.location.deleteMany({});
      await prisma.user.deleteMany({});
    });
    afterAll(async () => {
      await prisma.$disconnect();
      deviceUpdateQueueAddMock.mockRestore();  // Restore original add method after tests
      deviceUpdateQueueProcessMock.mockRestore();  // Restore original process method after tests
    });

    beforeEach(async () => {
      await prisma.$executeRaw`BEGIN TRANSACTION`;
    });

    afterEach(async () => {
      await prisma.$executeRaw`ROLLBACK TRANSACTION`;
    });

    it('should login the user successfully', async () => {
      hashedPassword = await bcrypt.hash(loginPayload.password, 10);
      const user = await prisma.user.create({ data: { ...userData, password: hashedPassword } });
      const res = await request(app)
        .post('/api/v1/users/login')
        .send(loginPayload);
      expect(res.status).toBe(200);
      const token = res.body.data;
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      expect(decoded.userId).toEqual(user.id);
       expect(deviceUpdateQueue.add).toHaveBeenCalledWith({
        userId: user.id,
        deviceToken: loginPayload.deviceToken,
        deviceType: loginPayload.deviceType,
      });
      expect(deviceUpdateQueue.process).toHaveBeenCalled();
    });
    it('should reject incorrect email', async () => {
      hashedPassword = await bcrypt.hash(loginPayload.password, 10);
      await prisma.user.create({ data: { ...userData, password: hashedPassword } });
      const res = await request(app)
        .post('/api/v1/users/login')
        .send({ ...loginPayload, email: 'incorrect@gmail.com' });
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual('Invalid email or password');
    });
    it('should reject incorrect password', async () => {
      hashedPassword = await bcrypt.hash(loginPayload.password, 10);
      await prisma.user.create({ data: { ...userData, password: hashedPassword } });
      const res = await request(app)
        .post('/api/v1/users/login')
        .send({ ...loginPayload, password: 'incorrectPass' });
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual('Invalid email or password');
    });
    it('should  validate required fields', async () => {
      const requiredFields = ['email', 'password', 'deviceType', 'deviceToken'];
      await Promise.all(
        Array.from(requiredFields, async (field) => {
          const res = await request(app)
            .post('/api/v1/users/login')
            .send({
              ...loginPayload,
              [field]: undefined // remove each required field to test
            });
          expect(res.status).toBe(400);
          expect(res.body.error).toEqual(`"${field}" is required`);
        })
      );
    });
  });
  describe('User Location Update Endpoint', () => {
    const userLocationUpdateQueueAddMock = jest.spyOn(userLocationUpdateQueue, 'add').mockImplementation((data) => {
      // console.log('adding to the queue in test...', data, typeof data);
      // Return a mock Job object that contains the data
      const mockJob: Partial<Job> = {
        id: 1,
        data
      };

      userLocationUpdateQueue.process(() => { });
      return Promise.resolve(mockJob as Job);
    });

    const userLocationUpdateQueueProcessMock = jest.spyOn(userLocationUpdateQueue, 'process').mockImplementation(async (job) => {
      // console.log('processing job in test, updating location...', job, typeof job);
      return Promise.resolve();
    });

    beforeAll(async () => {
      await clearAllSeed(prisma);
    });

    afterAll(async () => {
      await prisma.$disconnect();
      userLocationUpdateQueueAddMock.mockRestore();  // Restore original add method after tests
      userLocationUpdateQueueProcessMock.mockRestore();  // Restore original process method after tests
    });

    it('should send the location update to the queue and process it', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'testuser@example.com',
          password: 'hashedpassword', // Assume this is already hashed
          name: 'Test User',
          username: 'testuser',
          deviceType: 'ios',
          deviceToken: 'someDeviceToken',
        },
      });

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!); // Mock JWT token generation

      const response = await request(app)
        .post('/api/v1/users/location')
        .set('Authorization', `Bearer ${token}`)
        .send({
          longitude: 12.34,
          latitude: 56.78,
        })
        .expect(201);

      expect(response.body.message).toBe('User location sent to the queue for update');
      expect(userLocationUpdateQueue.add).toHaveBeenCalledWith({
        userId: user.id,
        longitude: 12.34,
        latitude: 56.78
      });
      expect(userLocationUpdateQueue.process).toHaveBeenCalled();
    });
  });
});