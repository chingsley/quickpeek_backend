import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

const slugPattern = /^[a-z0-9-]+$/;

export const validateCreateCategory = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    slug: Joi.string()
      .trim()
      .lowercase()
      .min(2)
      .max(50)
      .pattern(slugPattern)
      .message('slug may only contain lowercase letters, numbers, and hyphens')
      .optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  req.body = value;
  next();
};

export const validateUpdateCategory = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(2).max(50).optional(),
    slug: Joi.string()
      .trim()
      .lowercase()
      .min(2)
      .max(50)
      .pattern(slugPattern)
      .message('slug may only contain lowercase letters, numbers, and hyphens')
      .optional(),
  }).min(1);

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  req.body = value;
  next();
};
