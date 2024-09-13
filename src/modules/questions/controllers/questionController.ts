import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import { notifyNearbyUsersQueue } from '../../../core/queues/notifyNearbyUsersQueue';

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
      questionerId: question.userId,
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
        userId: req.user!.userId,
      }
    });
    // use questionId to get questioner id (as user.id) from user table
    // send answer to questioner as push notification
    res.status(201).json({
      message: 'Answer created successfully',
      data: answer
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create answer' });
  }
};

