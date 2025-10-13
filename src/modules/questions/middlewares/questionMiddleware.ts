import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateQuestionCreation = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    text: Joi.string().min(3).max(100).required(), // the text content of the question
    address: Joi.string().required(), // the textual address of the location, e.g nnpc katampe to be shown to responders. B/c the lon, lat won't make sense to responders,
    longitude: Joi.number().required(),
    latitude: Joi.number().required(),
  });

  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  next();
};

export const validateAnswerCreation = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    // questionId: Joi.string().required(),
    text: Joi.string().required(),
  });

  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  next();
};
