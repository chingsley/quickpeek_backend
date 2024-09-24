import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import config from '../../../core/config/default';
import prisma from '../../../core/database/prisma/client';
import { deviceUpdateQueue } from '../../../core/queues/deviceUpdateQueue';
import { userLocationUpdateQueue } from '../../../core/queues/userLocationUpdateQueue';
import {
  PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE
} from './../../../common/constants/index';


const JWT_SECRET = config.jwtSecret!;
const BCRYPT_SALT_ROUND = config.bcryptSaltRound!;

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { password, longitude, latitude, ...rest } = req.body;
    const hashedPassword = await bcrypt.hash(password, parseInt(BCRYPT_SALT_ROUND));

    const newUser = await prisma.user.create({
      data: {
        ...rest,
        password: hashedPassword,
      },
    });

    // consider implementing this asynchronously with Bull
    const userLocation = await prisma.location.create({
      data: {
        userId: newUser.id,
        latitude,
        longitude,
      }
    });

    res.status(201).json({
      message: 'User registered successfully',
      data: { user: newUser, location: userLocation },
    });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Handle unique constraint violation (P2002)
      if (error.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE) {
        const uniqueField = error.meta?.target as string[];

        let errorMessage = 'Unique constraint violation';
        if (uniqueField && uniqueField.includes('email')) {
          errorMessage = 'Email is already in use';
        } else if (uniqueField && uniqueField.includes('username')) {
          errorMessage = 'Username is already taken';
        }

        return res.status(400).json({ error: errorMessage });
      }
    }

    res.status(500).json({ error: 'Error registering user' });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password, deviceType, deviceToken } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
    await deviceUpdateQueue.add({
      userId: user.id,
      deviceType,
      deviceToken,
    });

    res.status(200).json({ message: 'Login successful', data: token });
  } catch (error) {
    res.status(500).json({ error: 'Error logging in' });
  }
};

export const updateUserLocation = async (req: Request, res: Response) => {
  try {
    const { longitude, latitude } = req.body;
    // implemented asynchronously using bull by publishing it to a queue
    // this is because this endpoint will potentially be called by many users every 5 minutes
    await userLocationUpdateQueue.add({
      userId: req.user!.userId,
      longitude,
      latitude,
    });

    res.status(201).json({
      message: 'User location sent to the queue for update',
      data: {}
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send user location to the queue' });
  }
};
