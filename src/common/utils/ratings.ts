import prisma from '../../core/database/prisma/client';
import redisClient from '../../core/config/redis';

export const DEFAULT_RATING = 0;

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour, matches userRatingsJob write
const cacheKey = (userId: string) => `userRating:${userId}`;

export type UserRatingSummary = {
  totalRating: number;
  answersCount: number;
  averageRating: number;
  source: 'cache' | 'db';
};

/**
 * Read-through accessor for a user's rating.
 *
 * 1. Try Redis cache (written by userRatingsJob).
 * 2. On miss, read from DB, populate the cache, return.
 * 3. Returns a default rating (0) for users with no rating row.
 *
 * The `userRatingsJob` is the only writer that increments totals, and it
 * refreshes the cache after each write — so reads are always consistent
 * with the latest accepted rating.
 */
export async function getUserRating(userId: string): Promise<UserRatingSummary> {
  const key = cacheKey(userId);

  // 1. Cache lookup
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as { totalRating: number; answersCount: number };
      return {
        totalRating: parsed.totalRating,
        answersCount: parsed.answersCount,
        averageRating: computeAverage(parsed.totalRating, parsed.answersCount),
        source: 'cache',
      };
    }
  } catch (err) {
    // Cache failures must not break rating reads — fall through to DB.
    console.error(`getUserRating: cache read failed for ${userId}`, err);
  }

  // 2. DB fallback
  const row = await prisma.userRating.findUnique({ where: { userId } });

  const totalRating = row?.totalRating ?? 0;
  const answersCount = row?.answersCount ?? 0;

  // 3. Repopulate cache on miss (best-effort).
  try {
    await redisClient.set(key, JSON.stringify({ totalRating, answersCount }), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    console.error(`getUserRating: cache write failed for ${userId}`, err);
  }

  return {
    totalRating,
    answersCount,
    averageRating: computeAverage(totalRating, answersCount),
    source: 'db',
  };
}

export function computeAverage(totalRating: number, answersCount: number): number {
  if (!answersCount || answersCount <= 0) return DEFAULT_RATING;
  return totalRating / answersCount;
}

/**
 * Invalidate the cached rating for a user. Call this if the underlying
 * totals are mutated outside of userRatingsJob (e.g. a data fix).
 */
export async function invalidateUserRatingCache(userId: string): Promise<void> {
  try {
    await redisClient.del(cacheKey(userId));
  } catch (err) {
    console.error(`invalidateUserRatingCache failed for ${userId}`, err);
  }
}
