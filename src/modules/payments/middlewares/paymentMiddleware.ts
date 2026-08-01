import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

const validate = (
  schema: Joi.ObjectSchema,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      error: error.details[0].message,
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
};

export const validatePaymentAccountCreation = (
  req: Request,
  res: Response,
  next: NextFunction,
) =>
  validate(
    Joi.object({
      currency: Joi.string().trim().length(3).required(),
    }),
    req,
    res,
    next,
  );

export const validateOnboarding = (req: Request, res: Response, next: NextFunction) =>
  validate(
    Joi.object({
      country: Joi.string().trim().length(2).optional(),
      bankCode: Joi.string().trim().max(10).optional(),
      accountNumber: Joi.string().trim().max(20).optional(),
    }),
    req,
    res,
    next,
  );

export const validatePaymentInitiation = (
  req: Request,
  res: Response,
  next: NextFunction,
) =>
  validate(
    Joi.object({
      answerRequestId: Joi.string().uuid().required(),
    }),
    req,
    res,
    next,
  );

export const validatePaymentVerification = (
  req: Request,
  res: Response,
  next: NextFunction,
) =>
  validate(
    Joi.object({
      transactionId: Joi.string().uuid().required(),
    }),
    req,
    res,
    next,
  );
