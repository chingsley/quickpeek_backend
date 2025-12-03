// src / modules / questions / controllers / questionController.ts;

import { Answer } from '@prisma/client';
import { Request, Response } from 'express';
// import { Prisma, Question } from '@prisma/client'; // Import Prisma types
import prisma from '../../../core/database/prisma/client';
import { notifyNearbyUsersQueue } from '../../../core/queues/notifyNearbyUsersQueue';
import { sendAnswerToquestionCreatorQueue } from '../../../core/queues/sendAnswerToQuestionCreatorQueue';
import redisClient from '../../../core/config/redis'; // Verified path
import { broadcastQuestionUpdate, io } from '../../../core/socket/socket.server';
import { questionTimeoutQueue } from '../../../core/queues/questionTimeoutQueue';


export const createQuestion = async (req: Request, res: Response) => {
  try {
    const { text, latitude, longitude, address } = req.body;
    const question = await prisma.question.create({
      data: { ...req.body, userId: req.user!.userId, },
    });
    notifyNearbyUsersQueue.add({ question });

    res.status(201).json({
      message: 'Question created successfully',
      data: question,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create question' });
  }
};

// TODO: paginate this endpoint
export const getUserPostedQuestions = async (req: Request, res: Response) => {
  try {
    const questions = await prisma.question.findMany({
      where: { userId: req.user?.userId },
      include: {
        answers: {
          select: {
            id: true,
            text: true,
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
            answerRating: {
              select: {
                rating: true,
              },
            },
          },
        },
      },
    });

    const formattedQuestions = questions.map((question) => {
      return {
        id: question.id,
        text: question.text,
        longitude: question.longitude,
        latitude: question.latitude,
        address: question.address,
        userId: question.userId,
        status: question.status,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
        answers: question.answers.map((answer) => {
          const userRating = answer.user.userRating;
          const responderAverageRating =
            userRating && userRating.answersCount > 0
              ? userRating.totalRating / userRating.answersCount
              : 0;
          return {
            text: answer.text,
            rating: answer.answerRating?.rating,
            responderUsername: answer.user.username,
            responderAverageRating,
            responderID: answer.user.id,
          };
        }),
      };
    });

    res.status(200).json({
      message: 'Successful',
      data: formattedQuestions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve questions' });
  }
};

export const getAnsweredQuestions = async (req: Request, res: Response) => {
  try {
    const questions = await prisma.question.findMany({
      where: {
        answers: {
          some: {
            userId: req.user?.userId,
          },
        },
      },
      include: {
        answers: {
          select: {
            id: true,
            text: true,
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
            answerRating: {
              select: {
                rating: true,
              },
            },
          },
        },
      },
    });

    const formattedQuestions = questions.map((question) => {
      return {
        id: question.id,
        text: question.text,
        longitude: question.longitude,
        latitude: question.latitude,
        address: question.address,
        userId: question.userId,
        status: question.status,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
        answers: question.answers.map((answer) => {
          const userRating = answer.user.userRating;
          const responderAverageRating =
            userRating && userRating.answersCount > 0
              ? userRating.totalRating / userRating.answersCount
              : 0;
          return {
            text: answer.text,
            rating: answer.answerRating?.rating,
            responderUsername: answer.user.username,
            responderAverageRating,
            responderID: answer.user.id,
          };
        }),
      };
    });

    res.status(200).json({
      message: 'Successful',
      data: formattedQuestions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve questions' });
  }
};

export const createAnswerForQuestion = async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    const questionId = req.params.questionId;
    const answer = await prisma.answer.create({
      data: {
        questionId,
        text,
        userId: req.user!.userId, // responder id
      }
    });

    sendAnswerToquestionCreatorQueue.add({
      questionId,
      answerText: answer.text,
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
          userId,
        },
      },
      include: {
        user: { // the responder
          select: {
            id: true,
            username: true,
            userRating: { // responder's rating
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

export const getPendingQuestions = async (req: Request, res: Response) => {
  try {
    const { questionIds } = req.query;

    if (!questionIds) {
      return res.status(400).json({ error: 'No questionIds provided' });
    }

    const parsedIds = (questionIds as string).split(',').map(id => id.trim());
    const question = await prisma.question.findMany({
      where: {
        id: {
          in: parsedIds
        },
      },
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    return res.json(question);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get question. Internal server error.' });
  }
};

export const claimQuestion = async (req: Request, res: Response) => {
  const { questionId } = req.params;
  const userId = req.user!.userId;
  const LOCK_DURATION_MS = 10 * 60 * 1000; // 10 Minutes

  try {
    const lockKey = `lock:question:${questionId}`;

    // 1. Redis Atomic Check: NX = Only set if Not Exists, PX = Expiry in MS
    const acquired = await redisClient.set(lockKey, userId, 'PX', LOCK_DURATION_MS, 'NX');

    if (!acquired) {
      return res.status(409).json({ error: 'This question has already been claimed by another user.' });
    }

    // 2. Update Database
    const updatedQuestion = await prisma.question.update({
      where: { id: questionId },
      data: {
        status: 'PENDING_ANSWER',
        claimedByUserId: userId,
        claimedAt: new Date(),
      },
    });

    // 3. Start Timeout Timer (Bull Queue)
    // Ensure you have created the queue as described in the previous step
    await questionTimeoutQueue.add(
      { questionId, claimedByUserId: userId },
      { delay: LOCK_DURATION_MS }
    );

    // 4. Notify everyone else to hide this question
    broadcastQuestionUpdate(questionId, { status: 'PENDING_ANSWER', claimedByUserId: userId });

    res.json({ message: 'Question claimed successfully', question: updatedQuestion });

  } catch (error) {
    console.error("Claim Error:", error);
    // Rollback Redis lock if DB update fails
    await redisClient.del(`lock:question:${questionId}`);
    res.status(500).json({ message: 'Error claiming question' });
  }
};

// TODO: Calling this endpoint everytime user opens the app to get nearby question is expensive. Consider implementing caching or rate limiting.
export const getNearbyQuestions = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Latitude and Longitude required" });
    }

    const lat = parseFloat(latitude as string);
    const lon = parseFloat(longitude as string);
    const radiusInKm = parseFloat(process.env.RADIUS_OF_CONCERN_IN_KM || '3'); // Default 3km

    // Raw SQL to find OPEN questions within radius
    const nearbyQuestions = await prisma.$queryRaw`
      SELECT id, text, address, longitude, latitude, status, "createdAt", "userId"
      FROM questions
      WHERE status = 'OPEN'
      AND (6371 * acos(
          cos(radians(${lat})) 
          * cos(radians(latitude)) 
          * cos(radians(longitude) - radians(${lon})) 
          + sin(radians(${lat})) * sin(radians(latitude))
      )) <= ${radiusInKm}
      ORDER BY "createdAt" DESC
      LIMIT 20;
    `;

    res.json({ message: "Successful", data: nearbyQuestions });
  } catch (error) {
    console.error("Error fetching nearby questions:", error);
    res.status(500).json({ error: "Failed to fetch nearby questions" });
  }
};
