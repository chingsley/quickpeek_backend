import prisma from '../../core/database/prisma/client';

/**
 * Market-wide runtime config keys. Stored as floats in the `market_configs`
 * table so values can be tuned per deployment without a code change.
 */
export const MARKET_CONFIG_KEYS = {
  nearMeRadiusKm: 'nearMeRadiusKm',
  reviewRevealWindowDays: 'reviewRevealWindowDays',
  platformFeePercent: 'platformFeePercent',
} as const;

const DEFAULTS: Record<string, number> = {
  [MARKET_CONFIG_KEYS.nearMeRadiusKm]: 5,
  [MARKET_CONFIG_KEYS.reviewRevealWindowDays]: 14,
  [MARKET_CONFIG_KEYS.platformFeePercent]: 0,
};

const CACHE_TTL_MS = 60_000;

const cache = new Map<string, number>();
let cacheExpiresAt = 0;

const refreshMarketConfigCache = async (): Promise<void> => {
  try {
    const rows = await prisma.marketConfig.findMany();
    cache.clear();
    for (const row of rows) {
      cache.set(row.key, row.value);
    }
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  } catch (err) {
    console.error('refreshMarketConfigCache failed', err);
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  }
};

/**
 * Read a market config value. Falls back to the default if the row is missing
 * or the DB read fails — never throws so feed/question-detail paths stay
 * resilient. All rows are loaded together and cached for `CACHE_TTL_MS`.
 */
export async function getMarketConfigValue(key: string): Promise<number> {
  if (cacheExpiresAt <= Date.now()) {
    await refreshMarketConfigCache();
  }

  const cached = cache.get(key);
  if (cached != null && !Number.isNaN(cached)) {
    return cached;
  }

  const fallback = DEFAULTS[key];
  if (fallback == null || Number.isNaN(fallback)) {
    console.error(`getMarketConfigValue(${key}) missing default`);
    return 0;
  }

  return fallback;
}

/** Days after review unlock before the submission/reveal window closes. */
export async function getReviewRevealWindowDays(): Promise<number> {
  return getMarketConfigValue(MARKET_CONFIG_KEYS.reviewRevealWindowDays);
}

/** Platform commission on question payments, in percent (0–100). */
export async function getPlatformFeePercent(): Promise<number> {
  return getMarketConfigValue(MARKET_CONFIG_KEYS.platformFeePercent);
}

/**
 * Update a config value. Invalidates the cache so the next read reloads all rows.
 */
export async function setMarketConfigValue(key: string, value: number): Promise<void> {
  await prisma.marketConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  cache.clear();
  cacheExpiresAt = 0;
}
