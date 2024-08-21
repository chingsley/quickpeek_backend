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

    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve questions' });
  }
};

