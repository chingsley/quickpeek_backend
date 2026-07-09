import redisClient from '../../core/config/redis';

const NEARBY_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
// Quantize coords to ~100m buckets so nearby cache keys are reusable.
const COORD_PRECISION = 3;

export function nearbyCacheKey(lat: number, lon: number, radiusInKm: number): string {
  const qLat = Number(lat.toFixed(COORD_PRECISION));
  const qLon = Number(lon.toFixed(COORD_PRECISION));
  return `nearbyQuestions:${qLat}:${qLon}:${radiusInKm}`;
}

export async function getCachedNearbyQuestions<T>(key: string): Promise<T | null> {
  try {
    const cached = await redisClient.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch (err) {
    console.error('getCachedNearbyQuestions: cache read failed', err);
    return null;
  }
}

export async function setCachedNearbyQuestions(key: string, data: unknown): Promise<void> {
  try {
    await redisClient.set(key, JSON.stringify(data), 'EX', NEARBY_CACHE_TTL_SECONDS);
  } catch (err) {
    // Cache write failures are non-fatal.
    console.error('setCachedNearbyQuestions: cache write failed', err);
  }
}

/**
 * Invalidate nearby-question caches. Called when a new question is created
 * (the new draft would surface in nearby lists) or when assignment/answer
 * state changes. We use a scan over the prefix rather than tracking every
 * key because the keyspace is bounded by coord buckets and TTL.
 */
export async function invalidateNearbyQuestionsCache(): Promise<void> {
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redisClient.scan(
        cursor,
        'MATCH',
        'nearbyQuestions:*',
        'COUNT',
        200,
      );
      cursor = next;
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.error('invalidateNearbyQuestionsCache failed', err);
  }
}
