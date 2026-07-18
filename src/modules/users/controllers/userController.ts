import { RatingRole, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import config from '../../../core/config/default';
import {
  LOCATION_FRESHNESS_MINUTES,
  LOCATION_ONLINE_MINUTES,
} from '../../../common/constants/location.constants';
import prisma from '../../../core/database/prisma/client';
import { deviceUpdateQueue } from '../../../core/queues/deviceUpdateQueue';
import { userLocationUpdateQueue } from '../../../core/queues/userLocationUpdateQueue';
import {
  errCodeConstants,
  PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE
} from './../../../common/constants/index';
import { getUserRating, getUserRatingByRole } from '../../../common/utils/ratings';
import { uploadProfileImage } from '../../../core/config/cloudinary';


const JWT_SECRET = config.jwtSecret!;
const JWT_EXPIRES_IN = config.jwtExpiresIn!;
const BCRYPT_SALT_ROUND = config.bcryptSaltRound!;

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { password, longitude: _______, latitude: _____, ...rest } = req.body;
    const hashedPassword = await bcrypt.hash(password, parseInt(BCRYPT_SALT_ROUND));

    const newUser = await prisma.user.create({
      data: {
        ...rest,
        password: hashedPassword,
        isVerified: false,
      },
    });

    const { password: _, createdAt: __, updatedAt: ___, ...sanitizedUser } = newUser;
    res.status(201).json({
      message: 'User registered successfully',
      data: { user: sanitizedUser },
    });
  } catch (error: any) {
    let errCode = errCodeConstants.SERVER.UNKNOWN_ERROR;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Handle unique constraint violation (P2002)
      if (error.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE) {
        const uniqueField = error.meta?.target as string[];

        let errorMessage = 'Unique constraint violation';
        if (uniqueField && uniqueField.includes('email')) {
          errorMessage = 'Email is already in use';
          errCode = errCodeConstants.REGISTRATION.EMAIL_CONFLICT;
        } else if (uniqueField && uniqueField.includes('username')) {
          errorMessage = 'Username is already exists. Choose a different username';
          errCode = errCodeConstants.REGISTRATION.USERNAME_CONFLICT;
        }

        return res.status(409).json({ error: errorMessage, code: errCode });
      }
    }

    res.status(500).json({ error: 'Error registering user', errCode });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const {
      email, password, deviceType, deviceToken, notificationsEnabled, locationSharingEnabled
    } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        location: {
          select: {
            longitude: true,
            latitude: true,
          }
        }
      }
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    await deviceUpdateQueue.add({
      userId: user.id,
      deviceType,
      deviceToken,
      notificationsEnabled,
      locationSharingEnabled
    });

    const { password: _, createdAt: __, updatedAt: ___, ...sanitizedUser } = user;
    res.status(200).json({ message: 'Login successful', data: { user: sanitizedUser, token } });
  } catch (error) {
    res.status(500).json({ error: 'Error logging in' });
  }
};

export const updateUserLocation = async (req: Request, res: Response) => {
  try {
    const { longitude, latitude } = req.body;
    // implemented asynchronously using bull by publishing it to a queue
    // this is because this endpoint will potentially be called by many users every 5 minutes
    await userLocationUpdateQueue.add({
      userId: req.user!.userId,
      longitude,
      latitude,
    });

    res.status(201).json({
      message: 'User location sent to the queue for update',
      data: {}
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send user location to the queue' });
  }
};

/**
 * GET /api/v1/users
 * Returns the authenticated user's profile, including their average rating
 * (read-through cache), answers count, and questions-answered count.
 */
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        location: { select: { latitude: true, longitude: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const rating = await getUserRating(userId);
    const answersCount = await prisma.answer.count({ where: { userId } });

    const { password, ...safeUser } = user;
    return res.status(200).json({
      message: 'Successful',
      data: {
        ...safeUser,
        rating: {
          averageRating: rating.averageRating,
          totalRating: rating.totalRating,
          answersCount: rating.answersCount,
        },
        answersCount,
      },
    });
  } catch (error) {
    console.error('getUserProfile error:', error);
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

/**
 * PUT /api/v1/users
 * Updates editable profile fields (name, username, notificationsEnabled,
 * locationSharingEnabled, deviceToken). Password/email changes are intentionally
 * out of scope here. Invalidates the user-rating cache is not needed because
 * ratings are not edited here.
 */
export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, username, notificationsEnabled, locationSharingEnabled, deviceToken, profileImageUrl } = req.body;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(username !== undefined ? { username } : {}),
        ...(notificationsEnabled !== undefined ? { notificationsEnabled } : {}),
        ...(locationSharingEnabled !== undefined ? { locationSharingEnabled } : {}),
        ...(deviceToken !== undefined ? { deviceToken } : {}),
        ...(profileImageUrl !== undefined ? { profileImageUrl } : {}),
      },
      include: {
        location: { select: { latitude: true, longitude: true } },
      },
    });

    const rating = await getUserRating(userId);
    const { password, ...safeUser } = updated;

    return res.status(200).json({
      message: 'Profile updated successfully',
      data: {
        ...safeUser,
        rating: {
          averageRating: rating.averageRating,
          totalRating: rating.totalRating,
          answersCount: rating.answersCount,
        },
      },
    });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE) {
      const uniqueField = error.meta?.target as string[];
      let errorMessage = 'Unique constraint violation';
      if (uniqueField && uniqueField.includes('username')) {
        errorMessage = 'Username already exists. Choose a different username.';
      }
      return res.status(409).json({ error: errorMessage });
    }
    console.error('updateUserProfile error:', error);
    return res.status(500).json({ error: 'Failed to update user profile' });
  }
};

/**
 * POST /api/v1/users/profile-image
 * Uploads a profile image via multipart form field `image`.
 */
export const uploadUserProfileImage = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    let profileImageUrl: string;
    try {
      profileImageUrl = await uploadProfileImage(file.buffer);
    } catch (uploadErr: any) {
      console.error('Profile image upload failed:', uploadErr);
      return res.status(400).json({ error: uploadErr?.message || 'Image upload failed' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { profileImageUrl },
      include: {
        location: { select: { latitude: true, longitude: true } },
      },
    });

    const rating = await getUserRating(userId);
    const { password, ...safeUser } = updated;

    return res.status(200).json({
      message: 'Profile image updated successfully',
      data: {
        ...safeUser,
        rating: {
          averageRating: rating.averageRating,
          totalRating: rating.totalRating,
          answersCount: rating.answersCount,
        },
      },
    });
  } catch (error) {
    console.error('uploadUserProfileImage error:', error);
    return res.status(500).json({ error: 'Failed to upload profile image' });
  }
};

export type NearbyResponderRow = {
  userId: string;
  username: string;
  name: string;
  profileImageUrl: string | null;
  distance: number;
  averageRating: number;
  totalRating: number;
  answersCount: number;
  notificationsEnabled: boolean;
  isOnline: boolean;
};

/**
 * GET /api/v1/users/nearby?latitude=&longitude=&sort=rating|proximity
 * Returns nearby users that the questioner can choose as a responder.
 * Excludes the requesting user. Sorted by rating desc or proximity asc.
 */
export const getNearbyResponders = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { latitude, longitude, sort } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and Longitude required' });
    }

    const lat = parseFloat(latitude as string);
    const lon = parseFloat(longitude as string);
    const radiusInKm = parseFloat(process.env.RADIUS_OF_CONCERN_IN_KM || '3');
    const limit = parseInt(process.env.NEARBY_RESPONDERS_LIMIT || '20', 10);
    const freshnessMinutes = LOCATION_FRESHNESS_MINUTES;
    const onlineMinutes = LOCATION_ONLINE_MINUTES;

    // Raw SQL: nearby users (excluding self) within radius, joined with their
    // rating summary and last-known location freshness.
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        username: string;
        name: string;
        profileImageUrl: string | null;
        latitude: number;
        longitude: number;
        distance: number;
        totalRating: number | null;
        answersCount: number | null;
        notificationsEnabled: boolean;
        locationUpdatedAt: Date | null;
      }>
    >`
      SELECT
        u.id,
        u.username,
        u.name,
        u."profileImageUrl",
        loc.latitude,
        loc.longitude,
        (6371 * acos(
            cos(radians(${lat}))
            * cos(radians(loc.latitude))
            * cos(radians(loc.longitude) - radians(${lon}))
            + sin(radians(${lat})) * sin(radians(loc.latitude))
        )) AS distance,
        COALESCE(ur."totalStars", 0) AS "totalRating",
        COALESCE(ur."reviewsCount", 0) AS "answersCount",
        u."notificationsEnabled",
        loc."updatedAt" AS "locationUpdatedAt"
      FROM users u
      JOIN locations loc ON loc."userId" = u.id
      LEFT JOIN user_ratings ur ON ur."userId" = u.id AND ur.role = 'AS_RESPONDER'
      WHERE u.id <> ${userId}
        AND u."locationSharingEnabled" = true
        AND loc."updatedAt" > NOW() - (${freshnessMinutes} * INTERVAL '1 minute')
        AND (6371 * acos(
            cos(radians(${lat}))
            * cos(radians(loc.latitude))
            * cos(radians(loc.longitude) - radians(${lon}))
            + sin(radians(${lat})) * sin(radians(loc.latitude))
        )) <= ${radiusInKm}
    `;

    // Consider a user "online/active" if their location was updated very recently.
    const now = Date.now();
    const onlineWindowMs = onlineMinutes * 60 * 1000;
    const responders: NearbyResponderRow[] = rows.map((r) => {
      const totalRating = r.totalRating ?? 0;
      const answersCount = r.answersCount ?? 0;
      const averageRating = answersCount > 0 ? totalRating / answersCount : 0;
      const locationUpdatedAtMs = r.locationUpdatedAt ? new Date(r.locationUpdatedAt).getTime() : 0;
      const isOnline = now - locationUpdatedAtMs <= onlineWindowMs;
      return {
        userId: r.id,
        username: r.username,
        name: r.name,
        profileImageUrl: r.profileImageUrl ?? null,
        distance: Number(r.distance),
        averageRating,
        totalRating,
        answersCount,
        notificationsEnabled: r.notificationsEnabled,
        isOnline,
      };
    });

    if (sort === 'rating') {
      responders.sort((a, b) => b.averageRating - a.averageRating || a.distance - b.distance);
    } else {
      // default: proximity
      responders.sort((a, b) => a.distance - b.distance);
    }

    return res.status(200).json({
      message: 'Successful',
      data: responders.slice(0, limit),
    });
  } catch (error) {
    console.error('getNearbyResponders error:', error);
    return res.status(500).json({ error: 'Failed to fetch nearby responders' });
  }
};

/**
 * GET /api/v1/users/:id/profile
 * Public profile with role-scoped ratings, activity counts, and revealed reviews.
 */
export const getPublicUserProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = Math.max(parseInt(String(req.query.page || '1'), 10), 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '10'), 10), 1), 50);
    const skip = (page - 1) * limit;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        profileImageUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [asResponder, asQuestioner, answersCount, questionsAskedCount, reviews, reviewsTotal] =
      await Promise.all([
        getUserRatingByRole(id, RatingRole.AS_RESPONDER),
        getUserRatingByRole(id, RatingRole.AS_QUESTIONER),
        prisma.question.count({
          where: {
            assignedResponderId: id,
            status: 'ANSWERED',
          },
        }),
        prisma.question.count({ where: { userId: id } }),
        prisma.review.findMany({
          where: { rateeId: id, isRevealed: true },
          orderBy: { revealedAt: 'desc' },
          skip,
          take: limit,
          include: {
            rater: {
              select: { id: true, name: true, username: true, profileImageUrl: true },
            },
          },
        }),
        prisma.review.count({ where: { rateeId: id, isRevealed: true } }),
      ]);

    return res.status(200).json({
      message: 'Successful',
      data: {
        ...user,
        asResponder: {
          averageRating: asResponder.averageRating,
          reviewsCount: asResponder.reviewsCount,
        },
        asQuestioner: {
          averageRating: asQuestioner.averageRating,
          reviewsCount: asQuestioner.reviewsCount,
        },
        answersCount,
        questionsAskedCount,
        reviews: reviews.map((review) => ({
          id: review.id,
          stars: review.stars,
          comment: review.comment,
          raterRole: review.raterRole,
          createdAt: review.createdAt.toISOString(),
          revealedAt: review.revealedAt?.toISOString() ?? null,
          rater: {
            id: review.rater.id,
            name: review.rater.name,
            username: review.rater.username,
            profileImageUrl: review.rater.profileImageUrl,
          },
        })),
        reviewsPagination: {
          page,
          limit,
          total: reviewsTotal,
          hasMore: skip + reviews.length < reviewsTotal,
        },
      },
    });
  } catch (error) {
    console.error('getPublicUserProfile error:', error);
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};
