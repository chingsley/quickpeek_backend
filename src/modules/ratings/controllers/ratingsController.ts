import { Answer } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import { notifyNearbyUsersQueue } from '../../../core/queues/notifyNearbyUsersQueue';
import { userRatingsUpdateQueue } from '../../../core/queues/userRatingsUpdateQueue';


export const rateAnswer = async (req: Request, res: Response) => {
  try {
    const { answerId, rating } = req.body;

    const answer = await prisma.answer.findUnique({
      where: { id: answerId },
      include: {
        user: {
          select: {
            id: true,
          }
        }
      }
    }) as Answer & { user: { id: string; }; };
    if (!answer) {
      return res.status(400).json({
        message: `no answer found for id: ${answerId}`
      });
    }

    const answerRating = await prisma.answerRating.create({
      data: { answerId, rating }
    });
    userRatingsUpdateQueue.add({
      userId: answer.user.id,
      rating
    });

    res.status(201).json({
      message: 'Ratings saved',
      data: answerRating,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create answer rating' });
  }
};