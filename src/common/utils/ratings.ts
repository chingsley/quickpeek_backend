import { RatingRole, ReviewerRole } from '@prisma/client';
import prisma from '../../core/database/prisma/client';
import redisClient from '../../core/config/redis';

export const DEFAULT_RATING = 0;
const CACHE_TTL_SECONDS = 60 * 60;

const cacheKey = (userId: string, role: RatingRole) => `userRating:${userId}:${role}`;

export type UserRatingSummary = {
  totalStars: number;
  reviewsCount: number;
  averageRating: number;
  source: 'cache' | 'db';
};

export function computeAverage(totalStars: number, reviewsCount: number): number {
  if (!reviewsCount || reviewsCount <= 0) return DEFAULT_RATING;
  return totalStars / reviewsCount;
}

export async function getUserRatingByRole(
  userId: string,
  role: RatingRole,
): Promise<UserRatingSummary> {
  const key = cacheKey(userId, role);

  try {
    const cached = await redisClient.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as { totalStars: number; reviewsCount: number };
      return {
        totalStars: parsed.totalStars,
        reviewsCount: parsed.reviewsCount,
        averageRating: computeAverage(parsed.totalStars, parsed.reviewsCount),
        source: 'cache',
      };
    }
  } catch (err) {
    console.error(`getUserRatingByRole: cache read failed for ${userId}`, err);
  }

  const row = await prisma.userRating.findUnique({
    where: { userId_role: { userId, role } },
  });

  const totalStars = row?.totalStars ?? 0;
  const reviewsCount = row?.reviewsCount ?? 0;

  try {
    await redisClient.set(
      key,
      JSON.stringify({ totalStars, reviewsCount }),
      'EX',
      CACHE_TTL_SECONDS,
    );
  } catch (err) {
    console.error(`getUserRatingByRole: cache write failed for ${userId}`, err);
  }

  return {
    totalStars,
    reviewsCount,
    averageRating: computeAverage(totalStars, reviewsCount),
    source: 'db',
  };
}

/** Responder-facing average (legacy helper name). */
export async function getUserRating(userId: string): Promise<UserRatingSummary & {
  totalRating: number;
  answersCount: number;
}> {
  const summary = await getUserRatingByRole(userId, RatingRole.AS_RESPONDER);
  return {
    ...summary,
    totalRating: summary.totalStars,
    answersCount: summary.reviewsCount,
  };
}

export async function recomputeUserRatingAggregate(
  userId: string,
  role: RatingRole,
): Promise<void> {
  // The ratee's role determines who the rater was. A user rated AS_RESPONDER
  // was rated BY a QUESTIONER, and vice-versa.
  const raterRole =
    role === RatingRole.AS_RESPONDER ? ReviewerRole.QUESTIONER : ReviewerRole.RESPONDER;

  const aggregate = await prisma.review.aggregate({
    where: {
      rateeId: userId,
      isRevealed: true,
      raterRole,
    },
    _sum: { stars: true },
    _count: { id: true },
  });

  const totalStars = aggregate._sum.stars ?? 0;
  const reviewsCount = aggregate._count.id ?? 0;

  await prisma.userRating.upsert({
    where: { userId_role: { userId, role } },
    create: { userId, role, totalStars, reviewsCount },
    update: { totalStars, reviewsCount },
  });

  try {
    await redisClient.set(
      cacheKey(userId, role),
      JSON.stringify({ totalStars, reviewsCount }),
      'EX',
      CACHE_TTL_SECONDS,
    );
  } catch (err) {
    console.error(`recomputeUserRatingAggregate cache write failed for ${userId}`, err);
  }
}

export async function invalidateUserRatingCache(
  userId: string,
  role?: RatingRole,
): Promise<void> {
  const roles = role ? [role] : [RatingRole.AS_RESPONDER, RatingRole.AS_QUESTIONER];
  try {
    await Promise.all(roles.map((r) => redisClient.del(cacheKey(userId, r))));
  } catch (err) {
    console.error(`invalidateUserRatingCache failed for ${userId}`, err);
  }
}
