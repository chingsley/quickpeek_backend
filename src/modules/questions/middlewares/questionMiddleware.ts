import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import prisma from '../../../core/database/prisma/client';

const LATITUDE = Joi.number().min(-90).max(90).precision(14);
const LONGITUDE = Joi.number().min(-180).max(180).precision(14);

const DEFAULT_CATEGORY_SLUG = 'other';

/**
 * Validates the new question payload.
 * Location fields are optional; if `latitude`/`longitude` are present,
 * `address` is required so the question can be displayed on the feed map.
 * `locationScope` (anything but `ANYWHERE`) limits answering to viewers
 * within the scope's radius of the question's coordinates, resolved live
 * from market config at check time.
 */
export const validateQuestionCreation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const schema = Joi.object({
    title: Joi.string().trim().min(5).max(120).required(),
    detail: Joi.string().trim().min(10).max(2000).required(),
    price: Joi.number().min(0).max(10000).required(),
    acceptanceCriteria: Joi.string().trim().min(5).max(1000).required(),
    latitude: LATITUDE.optional().allow(null),
    longitude: LONGITUDE.optional().allow(null),
    address: Joi.string().trim().max(300).optional().allow(null, ''),
    locationScope: Joi.string()
      .valid('EXACT_SPOT', 'WALKING', 'NEIGHBOURHOOD', 'CITY', 'ANYWHERE')
      .default('ANYWHERE'),
  });

  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({
      error: error.details[0].message,
      details: error.details.map((d) => d.message),
    });
  }

  // Location must be supplied as a complete set or omitted entirely.
  const hasAnyLocationField =
    value.latitude !== undefined ||
    value.longitude !== undefined ||
    value.address !== undefined;
  if (
    hasAnyLocationField &&
    (value.latitude == null || value.longitude == null || !value.address)
  ) {
    return res.status(400).json({
      error:
        'When location is provided, latitude, longitude and address are all required',
    });
  }

  // A distance-gated scope is meaningless without coordinates to anchor it.
  if (value.locationScope !== 'ANYWHERE' && (value.latitude == null || value.longitude == null)) {
    return res.status(400).json({
      error: 'locationScope other than ANYWHERE requires latitude and longitude',
    });
  }

  // Assign default category while category selection is deferred in the UI.
  const defaultCategory = await prisma.category.findUnique({
    where: { slug: DEFAULT_CATEGORY_SLUG },
    select: { id: true },
  });
  if (!defaultCategory) {
    return res.status(500).json({ error: 'Default category is not configured' });
  }

  req.body = { ...value, categoryId: defaultCategory.id };
  next();
};
