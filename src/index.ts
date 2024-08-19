import express, { Request, Response } from 'express';
import config from './core/config/default';

const app = express();
const PORT = config.port || 3000;

// Health check route
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).send(`Server is running on port: ${PORT}`);
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});