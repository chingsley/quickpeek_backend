import express from 'express';
import questionRoutes from './modules/questions/routes/questionRoutes';
import healthRoutes from './api/routes/healthRoute';
import userRoutes from './modules/users/routes/userRoutes';

const app = express();

app.use(express.json());

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/questions', questionRoutes);
app.use('/api/v1/users', userRoutes);

export default app;
