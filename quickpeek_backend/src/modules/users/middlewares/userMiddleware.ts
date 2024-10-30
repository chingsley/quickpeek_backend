import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateUserRegistration = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(30).required(),
    username: Joi.string().lowercase().min(3).max(30).required(),
    email: Joi.string().lowercase().email().required(),
    password: Joi.string().min(6).required(),
    deviceType: Joi.string().trim().valid(...['android', 'ios']).required(),
    deviceToken: Joi.string().trim().required(),
    notificationsEnabled: Joi.bool().required(),
    longitude: Joi.number(),
    latitude: Joi.number()
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  req.body = value;
  next();
};

export const validateUserLogin = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    email: Joi.string().lowercase().email().required(),
    password: Joi.string().min(6).required(),
    deviceType: Joi.string().trim().valid(...['android', 'ios']).required(),
    deviceToken: Joi.string().trim().required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  req.body = value;
  next();
};

export const validateUserLocation = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    longitude: Joi.number().required(),
    latitude: Joi.number().required(),
  });

  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  next();
};
