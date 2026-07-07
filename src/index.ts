// src/index.ts
import { createServer } from 'http';
import app from './app';
import config from './core/config/default';
import { initSocket } from './core/socket/socket.server';

const PORT = Number(config.port) || 3000;

const httpServer = createServer(app);

initSocket(httpServer);

import './core/queues';

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port: ${PORT}`);
});