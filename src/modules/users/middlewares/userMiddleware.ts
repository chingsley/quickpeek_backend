import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateUserRegistration = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(30).required(),
    username: Joi.string().lowercase().min(3).max(30).required(),
    email: Joi.string().lowercase().email().required(),
    password: Joi.string().min(6).required(),
    deviceType: Joi.string().trim().valid('android', 'ios', 'web').required(),
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
    deviceType: Joi.string().trim().valid(...['android', 'ios', 'web']).required(),
    deviceToken: Joi.string().trim().allow('').optional(),
    notificationsEnabled: Joi.when('deviceToken', {
      is: Joi.exist().not('').not(null), // Truthy and not empty string and not null
      then: Joi.boolean().valid(true),
      otherwise: Joi.boolean().valid(false)
    }),
    // Optional at login: the app no longer forces a value here, and the
    // device-update job only writes fields that are actually provided, so a
    // login can no longer silently reset a user's saved preference.
    locationSharingEnabled: Joi.bool().optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  req.body = value;
  next();
};

export const validateLocationUpdate = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  req.body = value;
  next();
};

export const validateUserProfileUpdate = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(30).optional(),
    username: Joi.string().lowercase().min(3).max(30).optional(),
    notificationsEnabled: Joi.boolean().optional(),
    locationSharingEnabled: Joi.boolean().optional(),
    deviceToken: Joi.string().trim().allow('').optional(),
    profileImageUrl: Joi.string().uri().allow('', null).optional(),
  }).min(1); // at least one field must be provided

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  req.body = value;
  next();
};
