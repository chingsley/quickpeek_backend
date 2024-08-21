import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';

export const createQuestion = async (req: Request, res: Response) => {
  try {
    const { userId, content, title, user, location } = req.body;

    const question = await prisma.question.create({
      data: {
        content,
        userId,
        title,
        user,
        location
      },
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
    const { userId } = req.params;

    const questions = await prisma.question.findMany({
      where: { userId: parseInt(userId, 10) },
    });

    res.status(200).json({
      message: 'Questions retrieved successfully',
      data: questions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve questions' });
  }
};

