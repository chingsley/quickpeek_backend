import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import questionRoutes from './modules/questions/routes/questionRoutes';
import healthRoutes from './api/routes/healthRoute';
import userRoutes from './modules/users/routes/userRoutes';
import ratingsRoutes from './modules/ratings/routes/ratingsRoutes';

const app = express();

app.use(express.json());
app.use(cors());

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/questions', questionRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/ratings', ratingsRoutes);
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
