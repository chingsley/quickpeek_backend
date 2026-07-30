import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

/**
 * Validates the PUT /config body. Every field is optional — only the supplied
 * ones are applied. At least one must be present.
 */
export const validateMarketConfigUpdate = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    nearMeRadiusKm: Joi.number().min(0.1).max(500).optional(),
    reviewRevealWindowDays: Joi.number().integer().min(1).max(90).optional(),
  }).min(1);

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  req.body = value;
  next();
};
