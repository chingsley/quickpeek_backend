import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';

export const validateSubmitReview = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    stars: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().trim().max(1000).allow('', null),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};
