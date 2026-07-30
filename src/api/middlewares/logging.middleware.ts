import { Request, Response, NextFunction } from 'express';
import logger from '../../core/logger';
import config from 'config';

const loggingEnabled = config.get<boolean>('logger.enabled');
const logRequestBody = config.get<boolean>('logger.logRequestBody');

const SUCCESS_STATUS_CODES = new Set([200, 201]);

export const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!loggingEnabled) {
    return next();
  }

  const start = Date.now();
  const { method, url, headers, body } = req;
  let responseBody: unknown;

  logger.info('Request', {
    method,
    url,
    headers,
    ...(logRequestBody ? { body } : {}),
  });

  const originalJson = res.json.bind(res);
  res.json = function json(body?: unknown) {
    responseBody = body;
    return originalJson(body);
  };

  const originalSend = res.send.bind(res);
  res.send = function send(body?: unknown) {
    if (responseBody === undefined) {
      responseBody = body;
    }
    const duration = Date.now() - start;
    logger.info('Response', { method, url, duration });
    return originalSend(body);
  };

  res.on('finish', () => {
    const status = res.statusCode;
    if (SUCCESS_STATUS_CODES.has(status)) {
      return;
    }

    const duration = Date.now() - start;
    const meta = {
      method: req.method,
      url: req.originalUrl || url,
      status,
      duration,
      responseBody,
      ...(logRequestBody ? { requestBody: body } : {}),
      userId: req.user?.userId,
    };

    if (status >= 500) {
      logger.error('Non-success response', meta);
    } else {
      logger.warn('Non-success response', meta);
    }
  });

  next();
};
