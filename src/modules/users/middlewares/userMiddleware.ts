import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateUserRegistration = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(30).required(),
    username: Joi.string().lowercase().min(3).max(30).required(),
    email: Joi.string().lowercase().email().required(),
    password: Joi.string().min(6).required(),
    deviceType: Joi.string().trim().valid('android', 'ios').required(),
    deviceToken: Joi.string().trim().allow('').optional(),
    notificationsEnabled: Joi.when('deviceToken', {
      is: Joi.exist().not('').not(null), // Truthy and not empty string and not null
      then: Joi.boolean().valid(true),
      otherwise: Joi.boolean().valid(false)
    }),
    locationSharingEnabled: Joi.bool().required(),
    longitude: Joi.number().optional(),
    latitude: Joi.number().optional()
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  req.body = {
    ...value,
    notificationsEnabled: !!value.deviceToken // if token is '' then notificationEnabled = false, else, true
  };
  next();
};

export const validateUserLogin = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    email: Joi.string().lowercase().email().required(),
    password: Joi.string().min(6).required(),
    deviceType: Joi.string().trim().valid(...['android', 'ios']).required(),
    deviceToken: Joi.string().trim().allow('').optional(),
    notificationsEnabled: Joi.when('deviceToken', {
      is: Joi.exist().not('').not(null), // Truthy and not empty string and not null
      then: Joi.boolean().valid(true),
      otherwise: Joi.boolean().valid(false)
    }),
    locationSharingEnabled: Joi.bool().required(),
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
