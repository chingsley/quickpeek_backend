// src / core / socket / socket.server.ts

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from '../../common/utils/jwt.utils';

export let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL || 'https://your-production-domain.com']
    : '*';
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"] // Only these methods?????
    },
  });

  io.use(async (socket: Socket, next) => {
    // Authenticate socket connection
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: Missing token'));

    const decodedToken = verifyToken(token); // user = { userId: <uuid> }
    if (!decodedToken) return next(new Error('Access denied, invalid token'));

    socket.data.user = decodedToken;
    next();
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join a room specific to the user for direct messaging
    const userId = socket.data.user.userId;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${userId}`);
    });
  });
};

// Helper to broadcast event to all users (or filter by proximity later)
export const broadcastQuestionUpdate = (questionId: string, payload: any) => {
  if (io) {
    io.emit('question:update', { questionId, ...payload });
  }
};