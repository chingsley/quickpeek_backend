import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import {
  MAX_RESPONSE_WINDOW_MS,
  MIN_RESPONSE_WINDOW_MS,
} from '../../../common/utils/response-window.utils';

export const validateSetResponseWindow = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    timeToRespondMs: Joi.number()
      .integer()
      .min(MIN_RESPONSE_WINDOW_MS)
      .max(MAX_RESPONSE_WINDOW_MS)
      .required()
      .messages({
        'number.min': `Response window must be at least ${MIN_RESPONSE_WINDOW_MS / 1000} seconds`,
        'number.max': 'Response window cannot exceed 24 hours',
      }),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  req.body = value;
  next();
};
