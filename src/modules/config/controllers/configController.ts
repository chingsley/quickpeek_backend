import { Request, Response } from 'express';
import {
  getMarketConfigValue,
  MARKET_CONFIG_KEYS,
  setMarketConfigValue,
} from '../configService';

export type MarketConfigResponse = {
  nearMeRadiusKm: number;
  reviewRevealWindowDays: number;
};

/**
 * GET /config
 * Public. Returns the market-wide runtime config consumed by the FE
 * (display text, near-me radius, etc.). Filter logic still runs BE-side.
 */
export const getMarketConfig = async (_req: Request, res: Response) => {
  try {
    const nearMeRadiusKm = await getMarketConfigValue(MARKET_CONFIG_KEYS.nearMeRadiusKm);
    const reviewRevealWindowDays = await getMarketConfigValue(MARKET_CONFIG_KEYS.reviewRevealWindowDays);
    const data: MarketConfigResponse = { nearMeRadiusKm, reviewRevealWindowDays };
    return res.status(200).json({ message: 'Successful', data });
  } catch (error) {
    console.error('getMarketConfig error:', error);
    return res.status(500).json({ error: 'Failed to fetch market config' });
  }
};

type UpdateBody = { nearMeRadiusKm?: number; reviewRevealWindowDays?: number; };

/**
 * PUT /config
 * Admin-only. Updates the market config values that are exposed via GET /config.
 */
export const updateMarketConfig = async (req: Request, res: Response) => {
  try {
    const { nearMeRadiusKm, reviewRevealWindowDays } = req.body as UpdateBody;

    if (nearMeRadiusKm != null) {
      await setMarketConfigValue(MARKET_CONFIG_KEYS.nearMeRadiusKm, nearMeRadiusKm);
    }
    if (reviewRevealWindowDays != null) {
      await setMarketConfigValue(MARKET_CONFIG_KEYS.reviewRevealWindowDays, reviewRevealWindowDays);
    }

    const data: MarketConfigResponse = {
      nearMeRadiusKm: await getMarketConfigValue(MARKET_CONFIG_KEYS.nearMeRadiusKm),
      reviewRevealWindowDays: await getMarketConfigValue(MARKET_CONFIG_KEYS.reviewRevealWindowDays),
    };
    return res.status(200).json({ message: 'Config updated', data });
  } catch (error) {
    console.error('updateMarketConfig error:', error);
    return res.status(500).json({ error: 'Failed to update market config' });
  }
};
