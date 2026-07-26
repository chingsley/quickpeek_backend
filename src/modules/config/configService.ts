import prisma from '../../core/database/prisma/client';

/**
 * Market-wide runtime config keys. Stored as floats in the `market_configs`
 * table so values can be tuned per deployment without a code change.
 */
export const MARKET_CONFIG_KEYS = {
  nearMeRadiusKm: 'nearMeRadiusKm',
} as const;

const DEFAULTS: Record<string, number> = {
  [MARKET_CONFIG_KEYS.nearMeRadiusKm]: 5,
};

const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { value: number; expiresAt: number; }>();

/**
 * Read a market config value. Falls back to the default if the row is missing
 * or the DB read fails — never throws so feed/question-detail paths stay
 * resilient. Results are cached for `CACHE_TTL_MS` to keep the hot path cheap.
 */
export async function getMarketConfigValue(key: string): Promise<number> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value: number | undefined;
  try {
    const row = await prisma.marketConfig.findUnique({ where: { key } });
    if (row) value = row.value;
  } catch (err) {
    console.error(`getMarketConfigValue(${key}) read failed`, err);
  }

  if (value == null || Number.isNaN(value)) {
    value = DEFAULTS[key];
  }

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Update a config value. Invalidates the cache so the next read picks it up.
 */
export async function setMarketConfigValue(key: string, value: number): Promise<void> {
  await prisma.marketConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  cache.delete(key);
}
