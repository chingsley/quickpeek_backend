// src / modules / questions / controllers / questionController.ts;

import { Answer } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import { sendAnswerToquestionCreatorQueue } from '../../../core/queues/sendAnswerToQuestionCreatorQueue';
import { notifyAssignedResponderQueue } from '../../../core/queues/notifyAssignedResponderQueue';
import redisClient from '../../../core/config/redis';
import { broadcastQuestionUpdate, emitToUser, io } from '../../../core/socket/socket.server';
import { questionTimeoutQueue } from '../../../core/queues/questionTimeoutQueue';
import { getUserRating, computeAverage } from '../../../common/utils/ratings';
import { uploadAnswerImage } from '../../../core/config/cloudinary';
import {
  nearbyCacheKey,
  getCachedNearbyQuestions,
  setCachedNearbyQuestions,
  invalidateNearbyQuestionsCache,
} from '../../../common/utils/cache';
import { expireAssignmentIfTtrElapsed } from '../../../common/utils/question-assignment.utils';

// Default TTR window for an assigned question (configurable via env).
const DEFAULT_TTR_MS = parseInt(process.env.QUESTION_TIME_TO_RESPOND_MS || `${10 * 60 * 1000}`, 10);
const RADIUS_OF_CONCERN_IN_KM = parseFloat(process.env.RADIUS_OF_CONCERN_IN_KM || '3');

/**
 * POST /questions — creates a question DRAFT (status OPEN). Under the
 * responder-selection flow, creation no longer broadcasts; the questioner
 * must subsequently POST /questions/:id/assign to pick a responder.
 */
export const createQuestion = async (req: Request, res: Response) => {
  try {
    const question = await prisma.question.create({
      data: { ...req.body, userId: req.user!.userId },
    });

    // A new OPEN draft would surface in nearby lists, so invalidate the cache.
    invalidateNearbyQuestionsCache().catch((err) =>
      console.error('createQuestion cache invalidation failed', err),
    );

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
      orderBy: { createdAt: 'desc' },
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

    const resolvedQuestions = [];
    for (const question of questions) {
      const expired = await expireAssignmentIfTtrElapsed(question);
      resolvedQuestions.push(
        expired
          ? {
              ...question,
              status: 'EXPIRED' as any,
              expiredAt: new Date(),
              assignedResponderId: null,
              assignedAt: null,
            }
          : question,
      );
    }

    const formattedQuestions = resolvedQuestions.map((question) => {
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
          const responderAverageRating = computeAverage(
            userRating?.totalRating ?? 0,
            userRating?.answersCount ?? 0,
          );
          return {
            id: answer.id,
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
      orderBy: { updatedAt: 'desc' },
      include: {
        answers: {
          where: {
            userId: req.user?.userId,
          },
          select: {
            id: true,
            text: true,
            imageUrl: true,
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
          const responderAverageRating = computeAverage(
            userRating?.totalRating ?? 0,
            userRating?.answersCount ?? 0,
          );
          return {
            id: answer.id,
            text: answer.text,
            imageUrl: answer.imageUrl,
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
    const userId = req.user!.userId;

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Responder-Selection Flow gate: only the assigned responder can answer,
    // and only while the question is ASSIGNED (within the TTR window).
    if ((question.status as any) !== 'ASSIGNED') {
      return res.status(409).json({
        error: `Question is not awaiting your answer (status: ${question.status})`,
      });
    }
    if (question.assignedResponderId !== userId) {
      return res.status(403).json({ error: 'Only the assigned responder can answer this question' });
    }

    // Image: prefer a Cloudinary-uploaded multipart file; otherwise accept an
    // `imageUrl` passed in the JSON body (e.g. client-side upload).
    let imageUrl: string | undefined;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (file) {
      try {
        imageUrl = await uploadAnswerImage(file.buffer);
      } catch (uploadErr: any) {
        console.error('Answer image upload failed:', uploadErr);
        return res.status(400).json({ error: uploadErr?.message || 'Image upload failed' });
      }
    } else if (req.body.imageUrl) {
      imageUrl = req.body.imageUrl;
    }

    const answer = await prisma.answer.create({
      data: {
        questionId,
        text,
        imageUrl,
        userId,
      },
    });

    // Flip question to ANSWERED, release the TTR lock, and cancel the timeout
    // job so it doesn't fire after the answer is in.
    await prisma.question.update({
      where: { id: questionId },
      data: {
        status: 'ANSWERED' as any,
        assignedAt: null,
        // Keep assignedResponderId for historical display of who answered.
      },
    });

    try {
      await redisClient.del(`lock:question:${questionId}`);
    } catch (lockErr) {
      console.error('Failed to release TTR lock:', lockErr);
    }

    try {
      const pendingJobs = await questionTimeoutQueue.getJobs(['delayed'], 0, 100);
      await Promise.all(
        pendingJobs
          .filter((j) => j.data?.questionId === questionId)
          .map((j) => j.remove()),
      );
    } catch (cancelErr) {
      console.error('Failed to cancel timeout job:', cancelErr);
    }

    // Notify the questioner. Use the field name the consumer expects
    // (sendAnswerToQuestionCreatorJob reads `answerContent`).
    sendAnswerToquestionCreatorQueue.add({
      questionId,
      answerContent: answer.text,
      responderId: answer.userId,
    });

    const answerUpdatePayload = {
      questionId,
      status: 'ANSWERED',
      answer: answer.text,
      answerId: answer.id,
      imageUrl: answer.imageUrl ?? undefined,
    };

    emitToUser(userId, 'question:update', answerUpdatePayload);
    emitToUser(question.userId, 'question:update', answerUpdatePayload);

    res.status(201).json({
      message: 'Answer created successfully',
      data: answer,
    });
  } catch (error) {
    console.error('createAnswerForQuestion error:', error);
    res.status(500).json({ error: 'Failed to create answer' });
  }
};

export const getAnswersByQuestionId = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user!.userId;
    type AnswerWithUser = Answer & {
      user: {
        id: string;
        username: string;
      };
    };
    const answersWithUser = await prisma.answer.findMany({
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
          },
        },
      },
    }) as AnswerWithUser[];

    // Compute each responder's average rating via the read-through cache util.
    const data = await Promise.all(
      answersWithUser.map(async (answer) => {
        const rating = await getUserRating(answer.user.id);
        return {
          ...answer,
          responderAverageRating: rating.averageRating,
          responderRatingSource: rating.source,
        };
      }),
    );

    return res.status(200).json({
      message: 'successful',
      data,
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

    // 2. Update Database (legacy race-to-claim path; maps to ASSIGNED in the new model)
    const updatedQuestion = await prisma.question.update({
      where: { id: questionId },
      data: {
        status: 'ASSIGNED',
        claimedByUserId: userId,
        claimedAt: new Date(),
      },
    });

    // 3. Start Timeout Timer (Bull Queue)
    await questionTimeoutQueue.add(
      { questionId, claimedByUserId: userId },
      { delay: LOCK_DURATION_MS }
    );

    // 4. Notify everyone else to hide this question
    broadcastQuestionUpdate(questionId, { status: 'ASSIGNED', claimedByUserId: userId });

    res.json({ message: 'Question claimed successfully', question: updatedQuestion });

  } catch (error) {
    console.error("Claim Error:", error);
    // Rollback Redis lock if DB update fails
    await redisClient.del(`lock:question:${questionId}`);
    res.status(500).json({ message: 'Error claiming question' });
  }
};

// Nearby questions with Redis read-through cache (5-min TTL, quantized coords).
export const getNearbyQuestions = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Latitude and Longitude required" });
    }

    const lat = parseFloat(latitude as string);
    const lon = parseFloat(longitude as string);
    const radiusInKm = parseFloat(process.env.RADIUS_OF_CONCERN_IN_KM || '3'); // Default 3km

    // 1. Try cache.
    const key = nearbyCacheKey(lat, lon, radiusInKm);
    const cached = await getCachedNearbyQuestions<any>(key);
    if (cached) {
      return res.json({ message: "Successful", data: cached, source: 'cache' });
    }

    // 2. Cache miss: raw SQL to find OPEN questions within radius.
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

    // 3. Repopulate cache.
    await setCachedNearbyQuestions(key, nearbyQuestions);

    res.json({ message: "Successful", data: nearbyQuestions, source: 'db' });
  } catch (error) {
    console.error("Error fetching nearby questions:", error);
    res.status(500).json({ error: "Failed to fetch nearby questions" });
  }
};

/**
 * Shared core for assigning (or re-assigning) a question to a responder.
 *
 * Validates ownership + question state + responder proximity, then sets the
 * question to ASSIGNED, acquires the TTR Redis lock, schedules the timeout
 * job, and enqueues the targeted notification.
 *
 * `reassigning` flips the precondition from `status === OPEN` to
 * `status === EXPIRED` (or legacy PENDING_ANSWER).
 */
async function assignQuestionToResponder(opts: {
  questionId: string;
  questionerId: string;
  responderId: string;
  timeToRespondMs?: number;
  reassigning: boolean;
}): Promise<{ question: any; timeToRespondMs: number }> {
  const { questionId, questionerId, responderId, reassigning } = opts;
  const timeToRespondMs = opts.timeToRespondMs ?? DEFAULT_TTR_MS;

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) {
    throw new ControllerError(404, 'Question not found');
  }
  if (question.userId !== questionerId) {
    throw new ControllerError(403, 'Only the questioner can assign this question');
  }

  if (reassigning) {
    const reassignable =
      (question.status as any) === 'EXPIRED' || (question.status as any) === 'PENDING_ANSWER';
    if (!reassignable) {
      throw new ControllerError(
        409,
        'Question cannot be reassigned in its current status',
      );
    }
  } else {
    if ((question.status as any) !== 'OPEN') {
      throw new ControllerError(
        409,
        'Question has already been assigned or is no longer open',
      );
    }
  }

  if (responderId === questionerId) {
    throw new ControllerError(400, 'You cannot assign a question to yourself');
  }

  const responder = await prisma.user.findUnique({
    where: { id: responderId },
    include: { location: { select: { latitude: true, longitude: true } } },
  });
  if (!responder) {
    throw new ControllerError(404, 'Responder not found');
  }
  if (!responder.location) {
    throw new ControllerError(400, 'Responder has no known location');
  }

  // Validate the responder is within the radius of concern of the question.
  const distanceKm = haversineKm(
    question.latitude,
    question.longitude,
    responder.location.latitude,
    responder.location.longitude,
  );
  if (distanceKm > RADIUS_OF_CONCERN_IN_KM) {
    throw new ControllerError(
      400,
      `Responder is ${distanceKm.toFixed(2)}km away (max ${RADIUS_OF_CONCERN_IN_KM}km)`,
    );
  }

  // Acquire the TTR Redis lock. The lock auto-expires as a safety net; the
  // timeout job is the authoritative expiry mechanism.
  const lockKey = `lock:question:${questionId}`;
  const acquired = await redisClient.set(lockKey, responderId, 'PX', timeToRespondMs, 'NX');
  if (!acquired) {
    throw new ControllerError(409, 'Question is already locked by an in-progress assignment');
  }

  const now = new Date();
  const updatedQuestion = await prisma.question.update({
    where: { id: questionId },
    data: {
      status: 'ASSIGNED' as any,
      assignedResponderId: responderId,
      assignedAt: now,
      timeToRespondMs,
      expiredAt: null,
      // Sync legacy claim fields so any old code still sees a consistent state.
      claimedByUserId: responderId,
      claimedAt: now,
    },
  }).catch(async (err) => {
    // Roll back the lock if the DB write failed.
    await redisClient.del(lockKey);
    throw err;
  });

  // Schedule the TTR timeout job.
  await questionTimeoutQueue.add(
    { questionId, assignedResponderId: responderId },
    { delay: timeToRespondMs },
  );

  // Enqueue a single targeted notification to the chosen responder.
  await notifyAssignedResponderQueue.add({ questionId, assignedResponderId: responderId });

  return { question: updatedQuestion, timeToRespondMs };
}

class ControllerError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * POST /questions/:questionId/assign
 * Responder-selection flow: questioner picks a responder for their OPEN draft.
 */
export const assignQuestion = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const { responderId, timeToRespondMs } = req.body;
    const result = await assignQuestionToResponder({
      questionId,
      questionerId: req.user!.userId,
      responderId,
      timeToRespondMs,
      reassigning: false,
    });
    return res.status(200).json({
      message: 'Question assigned successfully',
      data: result.question,
      timeToRespondMs: result.timeToRespondMs,
    });
  } catch (error: any) {
    if (error instanceof ControllerError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('assignQuestion error:', error);
    return res.status(500).json({ error: 'Failed to assign question' });
  }
};

/**
 * POST /questions/:questionId/reassign
 * Responder-selection flow: questioner picks a different responder after the
 * previous assignment's TTR expired.
 */
export const reassignQuestion = async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const { responderId, timeToRespondMs } = req.body;
    const result = await assignQuestionToResponder({
      questionId,
      questionerId: req.user!.userId,
      responderId,
      timeToRespondMs,
      reassigning: true,
    });
    return res.status(200).json({
      message: 'Question reassigned successfully',
      data: result.question,
      timeToRespondMs: result.timeToRespondMs,
    });
  } catch (error: any) {
    if (error instanceof ControllerError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('reassignQuestion error:', error);
    return res.status(500).json({ error: 'Failed to reassign question' });
  }
};

/**
 * GET /questions/assigned
 * Returns questions assigned to the authenticated user as a responder, i.e.
 * the responder's inbox under the select-and-assign flow.
 */
export const getAssignedQuestions = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const questions = await prisma.question.findMany({
      where: {
        assignedResponderId: userId,
        status: 'ASSIGNED' as any,
      },
      orderBy: { assignedAt: 'desc' },
      include: {
        user: { select: { id: true, username: true } },
        answers: {
          select: {
            id: true,
            text: true,
            answerRating: { select: { rating: true } },
          },
          take: 1,
        },
      },
    });

    const activeQuestions = [];
    for (const question of questions) {
      const expired = await expireAssignmentIfTtrElapsed(question);
      if (!expired) {
        activeQuestions.push(question);
      }
    }

    const data = activeQuestions.map((q) => {
      const firstAnswer = (q as any).answers?.[0];
      return {
        id: q.id,
        text: q.text,
        longitude: q.longitude,
        latitude: q.latitude,
        address: q.address,
        userId: q.userId,
        questionerUsername: (q as any).user?.username,
        status: q.status,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        assignedResponderId: q.assignedResponderId,
        assignedAt: q.assignedAt,
        timeToRespondMs: q.timeToRespondMs,
        expiredAt: q.expiredAt,
        answer: firstAnswer?.text ?? undefined,
        answerRating: firstAnswer?.answerRating?.rating ?? undefined,
        answerId: firstAnswer?.id ?? undefined,
      };
    });

    return res.status(200).json({ message: 'Successful', data });
  } catch (error) {
    console.error('getAssignedQuestions error:', error);
    return res.status(500).json({ error: 'Failed to fetch assigned questions' });
  }
};

// `broadcastQuestionUpdate` / `io` are still used by the legacy `claimQuestion`
// controller below; kept imported for back-compat until the claim flow is removed.
