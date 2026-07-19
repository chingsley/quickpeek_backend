import { Request, Response, NextFunction } from 'express';
import prisma from '../../core/database/prisma/client';

/**
 * Loads the authenticated user's `isAdmin` flag onto `req.user`.
 * Used together with `authenticateToken` to gate admin-only routes.
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Session expired, please sign in again' });
    }

    if (!user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('requireAdmin error:', error);
    return res.status(500).json({ error: 'Failed to verify admin access' });
  }
};
