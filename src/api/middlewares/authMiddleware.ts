import { TokenPayload } from './../../common/types/index';
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../common/utils/jwt.utils';
import prisma from '../../core/database/prisma/client';

//Augment the existing 'Request' interface from exporess
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied, no token provided' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Access denied, invalid token' });

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true },
  });

  if (!user) {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }

  req.user = decoded;
  next();
};
