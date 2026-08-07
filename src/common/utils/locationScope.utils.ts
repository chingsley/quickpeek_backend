import { LocationScope } from '@prisma/client';
import { getMarketConfigValue } from '../../modules/config/configService';
import { calculateHaversineDistance } from './geo.utils';

/**
 * The radius for each scope tier lives in market_configs so it can be
 * retuned without a deploy. ANYWHERE has no radius — no distance gating.
 */
export const SCOPE_CONFIG_KEY: Record<LocationScope, string | null> = {
  AT_EXACT_ADDRESS: 'radiusAtExactAddressKm',
  WALKING: 'radiusWalkingKm',
  NEIGHBOURHOOD: 'radiusNeighbourhoodKm',
  CITY: 'radiusCityKm',
  ANYWHERE: null,
};

export const getScopeRadiusKm = async (scope: LocationScope): Promise<number | null> => {
  const key = SCOPE_CONFIG_KEY[scope];
  if (!key) return null;
  return getMarketConfigValue(key);
};

export type ScopeCheckResult = {
  ok: boolean;
  reason: 'NO_VIEWER_LOCATION' | 'OUTSIDE_RADIUS' | null;
  distanceKm: number | null;
  radiusKm: number | null;
};

/**
 * The single place distance gating is decided. A scoped question without
 * coordinates cannot be anchored — creation validation prevents that state,
 * and legacy/loose rows are treated as ungateable rather than locking
 * everyone out.
 */
export const isWithinScope = async (opts: {
  scope: LocationScope;
  questionLat: number | null;
  questionLng: number | null;
  viewerLat?: number | null;
  viewerLng?: number | null;
}): Promise<ScopeCheckResult> => {
  if (opts.scope === 'ANYWHERE') {
    return { ok: true, reason: null, distanceKm: null, radiusKm: null };
  }

  const radiusKm = await getScopeRadiusKm(opts.scope);

  if (opts.questionLat == null || opts.questionLng == null) {
    return { ok: true, reason: null, distanceKm: null, radiusKm };
  }

  if (opts.viewerLat == null || opts.viewerLng == null) {
    return { ok: false, reason: 'NO_VIEWER_LOCATION', distanceKm: null, radiusKm };
  }

  const distanceKm = calculateHaversineDistance(
    opts.questionLat,
    opts.questionLng,
    opts.viewerLat,
    opts.viewerLng,
  );

  if (radiusKm != null && distanceKm > radiusKm) {
    return { ok: false, reason: 'OUTSIDE_RADIUS', distanceKm, radiusKm };
  }

  return { ok: true, reason: null, distanceKm, radiusKm };
};
