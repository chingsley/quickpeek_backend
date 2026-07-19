import { RatingRole } from '@prisma/client';
import { computeAverage, getUserRatingByRole } from '../../src/common/utils/ratings';

jest.mock('../../src/core/database/prisma/client', () => ({
  __esModule: true,
  default: {
    userRating: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    review: {
      aggregate: jest.fn(),
    },
  },
}));

jest.mock('../../src/core/config/redis', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve(1);
      }),
    },
  };
});

import prisma from '../../src/core/database/prisma/client';
import redisClient from '../../src/core/config/redis';

describe('ratings util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (redisClient.get as jest.Mock).mockClear();
    (redisClient.set as jest.Mock).mockClear();
    (prisma.userRating.findUnique as jest.Mock).mockClear();
  });

  describe('computeAverage', () => {
    it('returns 0 when there are no reviews', () => {
      expect(computeAverage(0, 0)).toBe(0);
      expect(computeAverage(10, 0)).toBe(0);
    });

    it('computes the mean rating', () => {
      expect(computeAverage(9, 3)).toBe(3);
      expect(computeAverage(13, 4)).toBe(3.25);
    });
  });

  describe('getUserRatingByRole', () => {
    it('returns from cache when present (no DB hit)', async () => {
      (redisClient.get as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({ totalStars: 8, reviewsCount: 2 }),
      );

      const result = await getUserRatingByRole('user-1', RatingRole.AS_RESPONDER);

      expect(result.source).toBe('cache');
      expect(result.totalStars).toBe(8);
      expect(result.reviewsCount).toBe(2);
      expect(result.averageRating).toBe(4);
      expect(prisma.userRating.findUnique).not.toHaveBeenCalled();
    });

    it('falls back to DB on cache miss and repopulates cache', async () => {
      (redisClient.get as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userRating.findUnique as jest.Mock).mockResolvedValueOnce({
        userId: 'user-2',
        role: RatingRole.AS_RESPONDER,
        totalStars: 15,
        reviewsCount: 5,
      });

      const result = await getUserRatingByRole('user-2', RatingRole.AS_RESPONDER);

      expect(result.source).toBe('db');
      expect(result.totalStars).toBe(15);
      expect(result.reviewsCount).toBe(5);
      expect(result.averageRating).toBe(3);
      expect(prisma.userRating.findUnique).toHaveBeenCalledWith({
        where: { userId_role: { userId: 'user-2', role: RatingRole.AS_RESPONDER } },
      });
      expect(redisClient.set).toHaveBeenCalledWith(
        'userRating:user-2:AS_RESPONDER',
        JSON.stringify({ totalStars: 15, reviewsCount: 5 }),
        'EX',
        60 * 60,
      );
    });

    it('returns default rating when no row exists', async () => {
      (redisClient.get as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userRating.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const result = await getUserRatingByRole('user-3', RatingRole.AS_QUESTIONER);

      expect(result.source).toBe('db');
      expect(result.totalStars).toBe(0);
      expect(result.reviewsCount).toBe(0);
      expect(result.averageRating).toBe(0);
    });

    it('still returns DB data if cache read throws', async () => {
      (redisClient.get as jest.Mock).mockRejectedValueOnce(new Error('redis down'));
      (prisma.userRating.findUnique as jest.Mock).mockResolvedValueOnce({
        userId: 'user-4',
        role: RatingRole.AS_RESPONDER,
        totalStars: 4,
        reviewsCount: 1,
      });

      const result = await getUserRatingByRole('user-4', RatingRole.AS_RESPONDER);

      expect(result.source).toBe('db');
      expect(result.averageRating).toBe(4);
    });
  });
});
