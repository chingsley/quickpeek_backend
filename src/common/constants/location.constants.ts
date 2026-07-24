/** How recently a responder must have shared location to appear in browse lists. */
export const LOCATION_FRESHNESS_MINUTES = parseInt(
  process.env.LOCATION_FRESHNESS_MINUTES || '15',
  10,
);

/** Window for marking a responder as online (green dot) in the UI. */
export const LOCATION_ONLINE_MINUTES = parseInt(
  process.env.LOCATION_ONLINE_MINUTES || '5',
  10,
);

/**
 * Market-wide radius (km) within which a located viewer is considered "near"
 * a question. Used as the fallback when a question has no own `answerRadiusKm`,
 * so the near-me icon indicator and the near-me filter stay consistent.
 */
export const NEAR_ME_RADIUS = parseFloat(process.env.NEAR_ME_RADIUS || '5');
