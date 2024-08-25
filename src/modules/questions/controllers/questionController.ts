import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';

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

    // draw a circle of xkm around 'location' point
    // fetch from users table all users that are withing xkm by checking long and lat values in users table
    // send question to those users as push notificaion (we need to know the device type of each user (ios or android, required for sending push notification))

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

