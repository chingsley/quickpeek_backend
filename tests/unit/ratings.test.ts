import { getUserRating, computeAverage } from '../../src/common/utils/ratings';

jest.mock('../../src/core/database/prisma/client', () => ({
  __esModule: true,
  default: {
    userRating: {
      findUnique: jest.fn(),
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
    it('returns 0 when there are no answers', () => {
      expect(computeAverage(0, 0)).toBe(0);
      expect(computeAverage(10, 0)).toBe(0);
    });
    it('computes the mean rating', () => {
      expect(computeAverage(9, 3)).toBe(3);
      expect(computeAverage(13, 4)).toBe(3.25);
    });
  });

  describe('getUserRating', () => {
    it('returns from cache when present (no DB hit)', async () => {
      (redisClient.get as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({ totalRating: 8, answersCount: 2 }),
      );

      const result = await getUserRating('user-1');

      expect(result.source).toBe('cache');
      expect(result.totalRating).toBe(8);
      expect(result.answersCount).toBe(2);
      expect(result.averageRating).toBe(4);
      expect(prisma.userRating.findUnique).not.toHaveBeenCalled();
    });

    it('falls back to DB on cache miss and repopulates cache', async () => {
      (redisClient.get as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userRating.findUnique as jest.Mock).mockResolvedValueOnce({
        userId: 'user-2',
        totalRating: 15,
        answersCount: 5,
      });

      const result = await getUserRating('user-2');

      expect(result.source).toBe('db');
      expect(result.totalRating).toBe(15);
      expect(result.answersCount).toBe(5);
      expect(result.averageRating).toBe(3);
      expect(prisma.userRating.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-2' } });
      expect(redisClient.set).toHaveBeenCalledWith(
        'userRating:user-2',
        JSON.stringify({ totalRating: 15, answersCount: 5 }),
        'EX',
        60 * 60,
      );
    });

    it('returns default rating when no row exists', async () => {
      (redisClient.get as jest.Mock).mockResolvedValueOnce(null);
      (prisma.userRating.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const result = await getUserRating('user-3');

      expect(result.source).toBe('db');
      expect(result.totalRating).toBe(0);
      expect(result.answersCount).toBe(0);
      expect(result.averageRating).toBe(0);
    });

    it('still returns DB data if cache read throws', async () => {
      (redisClient.get as jest.Mock).mockRejectedValueOnce(new Error('redis down'));
      (prisma.userRating.findUnique as jest.Mock).mockResolvedValueOnce({
        userId: 'user-4',
        totalRating: 4,
        answersCount: 1,
      });

      const result = await getUserRating('user-4');

      expect(result.source).toBe('db');
      expect(result.averageRating).toBe(4);
    });
  });
});
