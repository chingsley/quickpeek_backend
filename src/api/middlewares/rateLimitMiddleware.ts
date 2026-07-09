import rateLimit from 'express-rate-limit';

/**
 * Rate limits for the question endpoints. Tuned conservatively for a mobile
 * app where accidental retry storms are more likely than real abuse.
 */
export const questionCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 question drafts / assigns per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many question actions from this IP, please try again later.' },
});

export const nearbyReadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 nearby reads per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

export const answerSubmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60, // 60 answer submissions per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many answer submissions from this IP, please try again later.' },
});
