import { Request, Response } from 'express';
import {
  getMarketConfigValue,
  MARKET_CONFIG_KEYS,
  setMarketConfigValue,
} from '../configService';

export type MarketConfigResponse = {
  nearMeRadiusKm: number;
  reviewRevealWindowDays: number;
  radiusExactSpotKm: number;
  radiusWalkingKm: number;
  radiusNeighbourhoodKm: number;
  radiusCityKm: number;
};

/**
 * GET /config
 * Public. Returns the market-wide runtime config consumed by the FE
 * (display text, near-me radius, etc.). Filter logic still runs BE-side.
 */
export const getMarketConfig = async (_req: Request, res: Response) => {
  try {
    const [nearMeRadiusKm, reviewRevealWindowDays, radiusExactSpotKm, radiusWalkingKm, radiusNeighbourhoodKm, radiusCityKm] =
      await Promise.all([
        getMarketConfigValue(MARKET_CONFIG_KEYS.nearMeRadiusKm),
        getMarketConfigValue(MARKET_CONFIG_KEYS.reviewRevealWindowDays),
        getMarketConfigValue(MARKET_CONFIG_KEYS.radiusExactSpotKm),
        getMarketConfigValue(MARKET_CONFIG_KEYS.radiusWalkingKm),
        getMarketConfigValue(MARKET_CONFIG_KEYS.radiusNeighbourhoodKm),
        getMarketConfigValue(MARKET_CONFIG_KEYS.radiusCityKm),
      ]);
    const data: MarketConfigResponse = {
      nearMeRadiusKm,
      reviewRevealWindowDays,
      radiusExactSpotKm,
      radiusWalkingKm,
      radiusNeighbourhoodKm,
      radiusCityKm,
    };
    return res.status(200).json({ message: 'Successful', data });
  } catch (error) {
    console.error('getMarketConfig error:', error);
    return res.status(500).json({ error: 'Failed to fetch market config' });
  }
};

type UpdateBody = {
  nearMeRadiusKm?: number;
  reviewRevealWindowDays?: number;
  radiusExactSpotKm?: number;
  radiusWalkingKm?: number;
  radiusNeighbourhoodKm?: number;
  radiusCityKm?: number;
};

/**
 * PUT /config
 * Admin-only. Updates the market config values that are exposed via GET /config.
 */
export const updateMarketConfig = async (req: Request, res: Response) => {
  try {
    const body = req.body as UpdateBody;
    const updatable = [
      MARKET_CONFIG_KEYS.nearMeRadiusKm,
      MARKET_CONFIG_KEYS.reviewRevealWindowDays,
      MARKET_CONFIG_KEYS.radiusExactSpotKm,
      MARKET_CONFIG_KEYS.radiusWalkingKm,
      MARKET_CONFIG_KEYS.radiusNeighbourhoodKm,
      MARKET_CONFIG_KEYS.radiusCityKm,
    ] as const;
    for (const key of updatable) {
      const value = body[key as keyof UpdateBody];
      if (value != null) {
        await setMarketConfigValue(key, value);
      }
    }

    const data: MarketConfigResponse = {
      nearMeRadiusKm: await getMarketConfigValue(MARKET_CONFIG_KEYS.nearMeRadiusKm),
      reviewRevealWindowDays: await getMarketConfigValue(MARKET_CONFIG_KEYS.reviewRevealWindowDays),
      radiusExactSpotKm: await getMarketConfigValue(MARKET_CONFIG_KEYS.radiusExactSpotKm),
      radiusWalkingKm: await getMarketConfigValue(MARKET_CONFIG_KEYS.radiusWalkingKm),
      radiusNeighbourhoodKm: await getMarketConfigValue(MARKET_CONFIG_KEYS.radiusNeighbourhoodKm),
      radiusCityKm: await getMarketConfigValue(MARKET_CONFIG_KEYS.radiusCityKm),
    };
    return res.status(200).json({ message: 'Config updated', data });
  } catch (error) {
    console.error('updateMarketConfig error:', error);
    return res.status(500).json({ error: 'Failed to update market config' });
  }
};
