import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';

export const validateSendMessage = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    text: Joi.string().trim().min(1).max(2000).required(),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};
