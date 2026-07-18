export const MIN_RESPONSE_WINDOW_MS = 30 * 1000;
export const MAX_RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const formatResponseWindowLabel = (ms: number): string => {
  const minutes = Math.round(ms / (60 * 1000));
  if (minutes < 60) {
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }

  const hours = ms / (60 * 60 * 1000);
  if (hours === 1) {
    return '1 hour';
  }

  if (Number.isInteger(hours)) {
    return `${hours} hours`;
  }

  return `${hours.toFixed(1)} hours`;
};
