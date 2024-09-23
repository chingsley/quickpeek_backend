import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateAnswerRatingsCreation = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    answerId: Joi.string().required(),
    rating: Joi.number().integer().min(1).max(5)
  });

  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  next();
};
