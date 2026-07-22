// src / app.ts

import { loggingMiddleware } from './api/middlewares/logging.middleware';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import questionRoutes from './modules/questions/routes/questionRoutes';
import categoryRoutes from './modules/categories/routes/categoryRoutes';
import requestRoutes from './modules/requests/routes/requestRoutes';
import healthRoutes from './api/routes/healthRoute';
import userRoutes from './modules/users/routes/userRoutes';

const app = express();

// Disable ETag so mobile clients don't get 304 responses with empty bodies.
app.set('etag', false);

// Required when requests arrive via a proxy (e.g. Expo tunnel) so
// express-rate-limit can safely read X-Forwarded-For.
app.set('trust proxy', 1);

app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});
app.use(loggingMiddleware);

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/questions', questionRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/users', userRoutes);
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  if (error) {
    if (typeof error === 'object') {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: error });
    }
  } else {
    next();
  }
});

app.all(['/', '/ping'], function (req: Request, res: Response) {
  res.status(200).json('success');
});

app.use(function (req: Request, res: Response) {
  res.status(404).json({ error: 'path not found' });
});

export default app;
