import { Answer } from '@prisma/client';
import { Request, Response } from 'express';
// import { Prisma, Question } from '@prisma/client'; // Import Prisma types
import prisma from '../../../core/database/prisma/client';
import { notifyNearbyUsersQueue } from '../../../core/queues/notifyNearbyUsersQueue';
import { sendAnswerToquestionCreatorQueue } from '../../../core/queues/sendAnswerToQuestionCreatorQueue';


export const createQuestion = async (req: Request, res: Response) => {
  try {
    const { content, title, location } = req.body;
    const question = await prisma.question.create({
      data: {
        title,
        content,
        location,
        userId: req.user!.userId,
      },
    });

    const [questionLon, questionLat] = location.split(',').map(Number);
    notifyNearbyUsersQueue.add({
      questionId: question.id,
      questionLon: questionLon,
      questionLat: questionLat,
      questionCreatorId: question.userId,
      questionTitle: title,
      questionContent: content
    });

    res.status(201).json({
      message: 'Question created successfully',
      data: question,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create question' });
  }
};

// TODO: paginate this endpoint
export const getAllQuestionsByUserId = async (req: Request, res: Response) => {
  try {
    const questions = await prisma.question.findMany({
      where: { userId: req.user?.userId },
    });

    res.status(200).json({
      message: 'Successful',
      data: questions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve questions' });
  }
};

export const createAnswerForQuestion = async (req: Request, res: Response) => {
  try {
    const { questionId, content } = req.body;
    const answer = await prisma.answer.create({
      data: {
        questionId,
        content,
        userId: req.user!.userId, // responder id
      }
    });

    sendAnswerToquestionCreatorQueue.add({
      questionId,
      answerContent: answer.content,
      responderId: answer.userId,
    });
    res.status(201).json({
      message: 'Answer created successfully',
      data: answer
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create answer' });
  }
};

export const getAnswersByQuestionId = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;
    type AnswerWithUserRating = Answer & {
      user: {
        id: string;
        username: string;
        userRating: {
          totalRating: number;
          answersCount: number;
        };
      };
    };
    const answersWithUserAndRating = await prisma.answer.findMany({
      where: {
        questionId,
        question: {
          userId: userId,  // Filter to only include questions created by the requesting user
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            userRating: {
              select: {
                totalRating: true,
                answersCount: true,
              },
            },
          },
        },
      },
    }) as AnswerWithUserRating[];


    return res.status(200).json({
      message: 'successful',
      data: answersWithUserAndRating,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get question. Internal service error.' });
  }
};


