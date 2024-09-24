import { Answer } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
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
        },
        question: {
          select: {
            id: true,
            userId: true
          }
        }
      }
    }) as Answer & { user: { id: string; }; question: { id: string; userId: string; }; };
    if (!answer) {
      return res.status(400).json({
        message: `no answer found for id: ${answerId}`,
        code: 'R001'
      });
    }

    if (answer.question.userId !== req.user!.userId) {
      return res.status(401).json({
        message: `Authorization failed. You cannot rate this answer`,
        code: 'R002'
      });
    }

    const answerRating = await prisma.answerRating.create({
      data: { answerId, rating }
    });
    console.log('adding data to queue...');
    await userRatingsUpdateQueue.add({
      userId: answer.user.id,
      rating
    });

    res.status(201).json({
      message: 'Ratings saved',
      data: answerRating,
    });
  } catch (error) {
    console.error('\n>>>>>>>>', error);
    res.status(500).json({ error: 'Failed to create answer rating' });
  }
};