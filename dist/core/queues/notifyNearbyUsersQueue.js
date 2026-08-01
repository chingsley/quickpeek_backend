"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyNearbyUsersQueue = void 0;
const bull_1 = __importDefault(require("bull"));
const notifyNearbyUsersQueue = new bull_1.default('notifyNearbyUsersQueue', {
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
});
exports.notifyNearbyUsersQueue = notifyNearbyUsersQueue;
