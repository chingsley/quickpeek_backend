import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateQuestionCreation = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    text: Joi.string()
      .min(3)
      .max(100)
      .required()
      .messages({
        "string.empty": "Question text is required",
        "string.min": "Question must be at least 3 characters",
      }),

    address: Joi.string()
      .min(3)
      .required()
      .messages({
        "string.empty": "Address is required",
      }),

    longitude: Joi.number()
      .min(-180)
      .max(180)
      .precision(14)
      .required()
      .messages({
        "number.base": "Longitude must be a number",
        "number.min": "Longitude must be >= -180",
        "number.max": "Longitude must be <= 180",
      }),

    latitude: Joi.number()
      .min(-90)
      .max(90)
      .precision(14)
      .required()
      .messages({
        "number.base": "Latitude must be a number",
        "number.min": "Latitude must be >= -90",
        "number.max": "Latitude must be <= 90",
      }),
  });

  const { error } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    return res.status(400).json({
      error: error.details[0].message,
      details: error.details.map(d => d.message),
    });
  }

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

export const validateGetNearbyQuestionsPayload = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    longitude: Joi.number()
      .min(-180)
      .max(180)
      .precision(14)
      .required()
      .messages({
        "number.base": "Longitude must be a number",
        "number.min": "Longitude must be >= -180",
        "number.max": "Longitude must be <= 180",
      }),

    latitude: Joi.number()
      .min(-90)
      .max(90)
      .precision(14)
      .required()
      .messages({
        "number.base": "Latitude must be a number",
        "number.min": "Latitude must be >= -90",
        "number.max": "Latitude must be <= 90",
      }),
  });

  const { error } = schema.validate(req.query);
  if (error) return res.status(400).json({ error: error.details[0].message });

  next();
};

export const validateAssignQuestion = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    responderId: Joi.string().required().messages({
      'string.empty': 'responderId is required',
    }),
    // Optional override of the default TTR window (ms). Defaults are applied
    // in the controller from QUESTION_TIME_TO_RESPOND_MS.
    timeToRespondMs: Joi.number().integer().min(30 * 1000).max(24 * 60 * 60 * 1000).optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  req.body = value;
  next();
};

export const validateReassignQuestion = (req: Request, res: Response, next: NextFunction) => {
  const schema = Joi.object({
    responderId: Joi.string().required().messages({
      'string.empty': 'responderId is required',
    }),
    timeToRespondMs: Joi.number().integer().min(30 * 1000).max(24 * 60 * 60 * 1000).optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  req.body = value;
  next();
};
