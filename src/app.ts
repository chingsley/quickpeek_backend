import express from 'express';
import questionRoutes from './modules/questions/routes/questionRoutes';
import healthRoutes from './api/routes/healthRoute';

const app = express();

app.use(express.json());

app.use('/api/v1/questions', questionRoutes); // Mount the question routes
app.use('/api/v1/health', healthRoutes); // Mount the question routes

export default app;
