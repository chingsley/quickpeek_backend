import app from './app';
import config from './core/config/default';

const PORT = config.port || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});