import { setMarketConfigValue } from '../../src/modules/config/configService';
import {
  getScopeRadiusKm,
  isWithinScope,
  SCOPE_CONFIG_KEY,
} from '../../src/common/utils/locationScope.utils';
import prisma from '../../src/core/database/prisma/client';

// Halifax waterfront ↔ downtown points for realistic distances.
const SPOT = { lat: 44.6475, lng: -63.5708 };
const NEAR = { lat: 44.6499, lng: -63.5722 }; // ~180 m away
const ACROSS_TOWN = { lat: 44.6657, lng: -63.5756 }; // ~2 km away
const FAR_CITY = { lat: 44.38, lng: -64.52 }; // Bridgewater-ish, > 60 km

afterAll(async () => {
  await setMarketConfigValue('radiusExactSpotKm', 0.3);
  await prisma.$disconnect();
});

describe('getScopeRadiusKm', () => {
  it('resolves tier radii from market config defaults', async () => {
    expect(await getScopeRadiusKm('EXACT_SPOT')).toBe(0.3);
    expect(await getScopeRadiusKm('WALKING')).toBe(1);
    expect(await getScopeRadiusKm('NEIGHBOURHOOD')).toBe(5);
    expect(await getScopeRadiusKm('CITY')).toBe(25);
  });

  it('returns null for ANYWHERE (no radius)', async () => {
    expect(await getScopeRadiusKm('ANYWHERE')).toBeNull();
  });

  it('reads live overrides from market_configs', async () => {
    await setMarketConfigValue('radiusExactSpotKm', 0.5);
    expect(await getScopeRadiusKm('EXACT_SPOT')).toBe(0.5);
    await setMarketConfigValue('radiusExactSpotKm', 0.3);
  });

  it('maps every scope to its config key (or null)', () => {
    expect(SCOPE_CONFIG_KEY).toEqual({
      EXACT_SPOT: 'radiusExactSpotKm',
      WALKING: 'radiusWalkingKm',
      NEIGHBOURHOOD: 'radiusNeighbourhoodKm',
      CITY: 'radiusCityKm',
      ANYWHERE: null,
    });
  });
});

describe('isWithinScope', () => {
  it('always allows ANYWHERE, even without coordinates', async () => {
    const result = await isWithinScope({ scope: 'ANYWHERE', questionLat: null, questionLng: null });
    expect(result).toEqual({ ok: true, reason: null, distanceKm: null, radiusKm: null });
  });

  it('treats a scoped question without coordinates as ungateable (defensive)', async () => {
    const result = await isWithinScope({
      scope: 'EXACT_SPOT',
      questionLat: null,
      questionLng: null,
      viewerLat: NEAR.lat,
      viewerLng: NEAR.lng,
    });
    expect(result.ok).toBe(true);
    expect(result.radiusKm).toBe(0.3);
  });

  it('requires the viewer location for scoped questions', async () => {
    const result = await isWithinScope({
      scope: 'EXACT_SPOT',
      questionLat: SPOT.lat,
      questionLng: SPOT.lng,
      viewerLat: null,
      viewerLng: null,
    });
    expect(result).toMatchObject({ ok: false, reason: 'NO_VIEWER_LOCATION', radiusKm: 0.3 });
  });

  it('EXACT_SPOT: allows ~180 m, blocks ~2 km', async () => {
    const near = await isWithinScope({
      scope: 'EXACT_SPOT',
      questionLat: SPOT.lat,
      questionLng: SPOT.lng,
      viewerLat: NEAR.lat,
      viewerLng: NEAR.lng,
    });
    expect(near).toMatchObject({ ok: true, reason: null });

    const far = await isWithinScope({
      scope: 'EXACT_SPOT',
      questionLat: SPOT.lat,
      questionLng: SPOT.lng,
      viewerLat: ACROSS_TOWN.lat,
      viewerLng: ACROSS_TOWN.lng,
    });
    expect(far.ok).toBe(false);
    expect(far.reason).toBe('OUTSIDE_RADIUS');
    expect(far.distanceKm).toBeGreaterThan(0.3);
    expect(far.radiusKm).toBe(0.3);
  });

  it('CITY: allows a viewer 2 km away that EXACT_SPOT blocked', async () => {
    const result = await isWithinScope({
      scope: 'CITY',
      questionLat: SPOT.lat,
      questionLng: SPOT.lng,
      viewerLat: ACROSS_TOWN.lat,
      viewerLng: ACROSS_TOWN.lng,
    });
    expect(result).toMatchObject({ ok: true, reason: null });
  });

  it('CITY: blocks a viewer in a different region', async () => {
    const result = await isWithinScope({
      scope: 'CITY',
      questionLat: SPOT.lat,
      questionLng: SPOT.lng,
      viewerLat: FAR_CITY.lat,
      viewerLng: FAR_CITY.lng,
    });
    expect(result).toMatchObject({ ok: false, reason: 'OUTSIDE_RADIUS' });
  });

  it('WALKING and NEIGHBOURHOOD gate at their radii', async () => {
    const walking = await isWithinScope({
      scope: 'WALKING',
      questionLat: SPOT.lat,
      questionLng: SPOT.lng,
      viewerLat: ACROSS_TOWN.lat,
      viewerLng: ACROSS_TOWN.lng,
    });
    expect(walking).toMatchObject({ ok: false, reason: 'OUTSIDE_RADIUS', radiusKm: 1 });

    const hood = await isWithinScope({
      scope: 'NEIGHBOURHOOD',
      questionLat: SPOT.lat,
      questionLng: SPOT.lng,
      viewerLat: ACROSS_TOWN.lat,
      viewerLng: ACROSS_TOWN.lng,
    });
    expect(hood).toMatchObject({ ok: true, radiusKm: 5 });
  });
});
