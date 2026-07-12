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
