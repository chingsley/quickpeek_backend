import { Request, Response, NextFunction } from 'express';
import logger from '../../core/logger';
import config from 'config';

const loggingEnabled = config.get<boolean>('logger.enabled');

export const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!loggingEnabled) {
    return next();
  }

  const start = Date.now();

  const { method, url, headers, body } = req;

  logger.info('Request', { method, url, headers, body });

  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - start;
    logger.info('Response', { method, url, duration, body });
    return originalSend.apply(res, arguments as any);
  };

  next();
};
