import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateQuestionCreation = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    title: Joi.string().min(3).max(50).required(),
    content: Joi.string().min(3).max(100).required(),
    location: Joi.string().required(),
    address: Joi.string().required(),
  });

  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  next();
};

export const validateAnswerCreation = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    // questionId: Joi.string().required(),
    content: Joi.string().required(),
  });

  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  next();
};
