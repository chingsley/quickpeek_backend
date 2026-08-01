"use strict";
// src / core / socket / socket.server.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitToUser = exports.initSocket = exports.io = void 0;
const socket_io_1 = require("socket.io");
const jwt_utils_1 = require("../../common/utils/jwt.utils");
const initSocket = (httpServer) => {
    const allowedOrigins = process.env.NODE_ENV === 'production'
        ? [process.env.FRONTEND_URL || 'https://your-production-domain.com']
        : '*';
    exports.io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: allowedOrigins,
            methods: ["GET", "POST"] // Only these methods?????
        },
    });
    exports.io.use((socket, next) => __awaiter(void 0, void 0, void 0, function* () {
        // Authenticate socket connection
        const token = socket.handshake.auth.token;
        if (!token)
            return next(new Error('Authentication error: Missing token'));
        const decodedToken = (0, jwt_utils_1.verifyToken)(token); // user = { userId: <uuid> }
        if (!decodedToken)
            return next(new Error('Access denied, invalid token'));
        socket.data.user = decodedToken;
        next();
    }));
    exports.io.on('connection', (socket) => {
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
exports.initSocket = initSocket;
/**
 * Emit a socket event to a single user's room (`user:<userId>`).
 * Returns true if io was available (delivery is best-effort — the user
 * may simply not be connected, which is fine; a push notification
 * covers offline users).
 */
const emitToUser = (userId, event, payload) => {
    if (!exports.io)
        return false;
    exports.io.to(`user:${userId}`).emit(event, payload);
    return true;
};
exports.emitToUser = emitToUser;
