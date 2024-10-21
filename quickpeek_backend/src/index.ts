import app from './app';
import config from './core/config/default';

const PORT = config.port || 3000;

// Health check route
// app.get('/api/v1/health', (req: Request, res: Response) => {
//   res.status(200).send(`Server is running on port: ${PORT}`);
// });

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});