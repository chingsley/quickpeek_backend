"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Load .env before any other module reads process.env (jwt secret mismatch bug).
require("dotenv/config");
const http_1 = require("http");
const app_1 = __importDefault(require("./app"));
const default_1 = __importDefault(require("./core/config/default"));
const socket_server_1 = require("./core/socket/socket.server");
const PORT = Number(default_1.default.port) || 3000;
const httpServer = (0, http_1.createServer)(app_1.default);
(0, socket_server_1.initSocket)(httpServer);
require("./core/queues");
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port: ${PORT}`);
});
