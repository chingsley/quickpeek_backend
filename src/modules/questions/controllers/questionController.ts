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
import { createInitialQuestionerMessages } from '../../../common/utils/messages.utils';

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
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            profileImageUrl: true,
          },
        },
        answers: {
          select: {
            id: true,
            text: true,
            user: {
              select: {
                id: true,
                username: true,
                userRatings: {
                  where: { role: 'AS_RESPONDER' },
                  select: { totalStars: true, reviewsCount: true },
                },
              },
            },
          },
        },
        reviews: {
          select: {
            id: true,
            stars: true,
            comment: true,
            raterRole: true,
            isRevealed: true,
            rateeId: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            text: true,
            senderId: true,
            sender: {
              select: {
                id: true,
                name: true,
                username: true,
                profileImageUrl: true,
              },
            },
          },
        },
        assignedResponder: {
          select: {
            id: true,
            name: true,
            username: true,
            profileImageUrl: true,
            userRatings: {
              where: { role: 'AS_RESPONDER' },
              select: { totalStars: true, reviewsCount: true },
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
            }
          : question,
      );
    }

    const responderIdsMissingRelation = new Set<string>();
    for (const question of resolvedQuestions) {
      if (question.assignedResponderId && !question.assignedResponder) {
        responderIdsMissingRelation.add(question.assignedResponderId);
      }
    }

    const extraResponders =
      responderIdsMissingRelation.size > 0
        ? await prisma.user.findMany({
            where: { id: { in: [...responderIdsMissingRelation] } },
            select: {
              id: true,
              name: true,
              username: true,
              profileImageUrl: true,
            },
          })
        : [];
    const extraResponderMap = new Map(extraResponders.map((user) => [user.id, user]));

    const formattedQuestions = resolvedQuestions.map((question) => {
      const messages = (question as any).messages ?? [];
      const responderFromMessages = messages.find(
        (message: any) => message.senderId !== question.userId,
      )?.sender;
      const responder =
        question.assignedResponder ??
        (question.assignedResponderId
          ? extraResponderMap.get(question.assignedResponderId)
          : null) ??
        responderFromMessages ??
        null;
      const lastMessage = messages[messages.length - 1]?.text ?? null;

      return {
        id: question.id,
        text: question.text,
        longitude: question.longitude,
        latitude: question.latitude,
        address: question.address,
        userId: question.userId,
        questionerName: question.user?.name ?? question.user?.username,
        questionerUsername: question.user?.username,
        questionerProfileImageUrl: question.user?.profileImageUrl ?? null,
        assignedResponderId: question.assignedResponderId ?? responder?.id ?? null,
        assignedResponderName: responder?.name ?? null,
        assignedResponderUsername: responder?.username ?? null,
        assignedResponderProfileImageUrl: responder?.profileImageUrl ?? null,
        status: question.status,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
        answers: question.answers.map((answer) => {
          const userRating = answer.user.userRatings?.[0];
          const responderAverageRating = computeAverage(
            userRating?.totalStars ?? 0,
            userRating?.reviewsCount ?? 0,
          );
          return {
            id: answer.id,
            text: answer.text,
            rating: undefined,
            responderUsername: answer.user.username,
            responderAverageRating,
            responderID: answer.user.id,
          };
        }),
        lastMessage,
        questionReview: (question as any).reviews?.find(
          (review: any) => review.raterRole === 'QUESTIONER' && review.isRevealed,
        ) ?? null,
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
    const userId = req.user!.userId;
    const questions = await prisma.question.findMany({
      where: {
        OR: [
          {
            answers: {
              some: {
                userId,
              },
            },
          },
          {
            assignedResponderId: userId,
            status: 'ANSWERED' as any,
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            profileImageUrl: true,
          },
        },
        answers: {
          where: {
            userId,
          },
          select: {
            id: true,
            text: true,
            imageUrl: true,
            user: {
              select: {
                id: true,
                username: true,
                userRatings: {
                  where: { role: 'AS_RESPONDER' },
                  select: { totalStars: true, reviewsCount: true },
                },
              },
            },
          },
        },
        reviews: {
          select: {
            id: true,
            stars: true,
            comment: true,
            raterRole: true,
            isRevealed: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { text: true },
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
        questionerName: question.user?.name ?? question.user?.username,
        questionerUsername: question.user?.username,
        questionerProfileImageUrl: question.user?.profileImageUrl ?? null,
        status: question.status,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
        answers: question.answers.map((answer) => {
          const userRating = answer.user.userRatings?.[0];
          const responderAverageRating = computeAverage(
            userRating?.totalStars ?? 0,
            userRating?.reviewsCount ?? 0,
          );
          return {
            id: answer.id,
            text: answer.text,
            imageUrl: answer.imageUrl,
            rating: undefined,
            responderUsername: answer.user.username,
            responderAverageRating,
            responderID: answer.user.id,
          };
        }),
        lastMessage: (question as any).messages?.[0]?.text ?? null,
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
  reassigning: boolean;
}): Promise<{ question: any }> {
  const { questionId, questionerId, responderId, reassigning } = opts;

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

  const now = new Date();
  const updatedQuestion = await prisma.question.update({
    where: { id: questionId },
    data: {
      status: 'ASSIGNED' as any,
      assignedResponderId: responderId,
      assignedAt: now,
      timeToRespondMs: null,
      respondByAt: null,
      expiredAt: null,
      claimedByUserId: responderId,
      claimedAt: now,
    },
  });

  await notifyAssignedResponderQueue.add({ questionId, assignedResponderId: responderId });

  if (!reassigning) {
    await createInitialQuestionerMessages({
      questionId,
      questionerId,
      address: question.address,
      bodyText: question.text,
      assignedResponderId: responderId,
    });
  }

  return { question: updatedQuestion };
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
    const { responderId } = req.body;
    const result = await assignQuestionToResponder({
      questionId,
      questionerId: req.user!.userId,
      responderId,
      reassigning: false,
    });
    return res.status(200).json({
      message: 'Question assigned successfully',
      data: result.question,
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
    const { responderId } = req.body;
    const result = await assignQuestionToResponder({
      questionId,
      questionerId: req.user!.userId,
      responderId,
      reassigning: true,
    });
    return res.status(200).json({
      message: 'Question reassigned successfully',
      data: result.question,
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
        status: { in: ['ASSIGNED', 'EXPIRED'] as any },
      },
      orderBy: { assignedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, username: true, profileImageUrl: true } },
        answers: {
          select: {
            id: true,
            text: true,
          },
          take: 1,
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { text: true },
        },
      },
    });

    const activeQuestions = [];
    for (const question of questions) {
      if ((question.status as string) === 'ASSIGNED') {
        const expired = await expireAssignmentIfTtrElapsed(question);
        activeQuestions.push(
          expired
            ? { ...question, status: 'EXPIRED' as any, expiredAt: new Date() }
            : question,
        );
      } else {
        activeQuestions.push(question);
      }
    }

    const data = activeQuestions.map((q) => {
      const firstAnswer = (q as any).answers?.[0];
      const lastMessage = (q as any).messages?.[0];
      return {
        id: q.id,
        text: q.text,
        longitude: q.longitude,
        latitude: q.latitude,
        address: q.address,
        userId: q.userId,
        questionerName: (q as any).user?.name ?? (q as any).user?.username,
        questionerUsername: (q as any).user?.username,
        questionerProfileImageUrl: (q as any).user?.profileImageUrl ?? null,
        status: q.status,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        assignedResponderId: q.assignedResponderId,
        assignedAt: q.assignedAt,
        timeToRespondMs: q.timeToRespondMs,
        respondByAt: q.respondByAt,
        expiredAt: q.expiredAt,
        answeredAt: q.answeredAt,
        answer: lastMessage?.text ?? firstAnswer?.text ?? undefined,
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
