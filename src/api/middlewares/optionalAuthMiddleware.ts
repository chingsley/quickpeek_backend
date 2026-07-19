import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../common/utils/jwt.utils';
import prisma from '../../core/database/prisma/client';

/**
 * Attaches req.user when a valid Bearer token is present.
 * Does not reject unauthenticated requests.
 */
export const optionalAuthenticateToken = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return next();
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return next();
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true },
  });

  if (user) {
    req.user = decoded;
  }

  next();
};
