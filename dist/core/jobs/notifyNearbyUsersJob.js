"use strict";
// src / core / jobs / notifyNearbyUsersJob.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyNearbyUsers = void 0;
exports.findNearbyUsers = findNearbyUsers;
const client_1 = __importDefault(require("../database/prisma/client"));
const socket_server_1 = require("../socket/socket.server");
const notifyNearbyUsers = (job) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const radiusInKm = parseFloat(process.env.RADIUS_OF_CONCERN_IN_KM || '3');
        const { question } = job.data;
        const nearbyUsers = yield findNearbyUsers(client_1.default, question.longitude, question.latitude, radiusInKm);
        console.log({ "TO_REMOVE: nearbyUsers": nearbyUsers });
        if (nearbyUsers.length === 0)
            return;
        yield Promise.all(nearbyUsers.map((user) => __awaiter(void 0, void 0, void 0, function* () {
            // TODO: Remove this comment to avoid notifying users about their own questions
            // if (user.userId === question.userId) return; // Do not notify a user about their own question
            var _a;
            // SOCKET EMIT: Send to the specific user's room
            // We use the "user:UUID" room pattern we set up in socket.server.ts
            if (socket_server_1.io) {
                socket_server_1.io.to(`user:${user.userId}`).emit('question:new', {
                    id: question.id,
                    address: question.address,
                    longitude: question.longitude,
                    latitude: question.latitude,
                    text: question.text,
                    userId: question.userId,
                    createdAt: question.createdAt,
                    updatedAt: question.updatedAt,
                    status: question.status, // Should be 'OPEN',
                });
            }
            console.log('Active socket connections:', (_a = socket_server_1.io === null || socket_server_1.io === void 0 ? void 0 : socket_server_1.io.engine) === null || _a === void 0 ? void 0 : _a.clientsCount);
            if (!user.notificationsEnabled)
                return; // Skip if notifications are disabled
            const payload = {
                body: question.text,
                data: {
                    questionId: question.id,
                    questionAddress: question.address,
                },
            };
            // await sendNotification(user.deviceToken, payload);
        })));
        console.log(`Question sent to ${nearbyUsers.length} nearby users`);
    }
    catch (error) {
        console.error('Failed to send question to nearby users', error);
    }
});
exports.notifyNearbyUsers = notifyNearbyUsers;
// Function to find users within x kilometers radius from the given location using the Haversine formula in SQL
// The Haversine formula works with distances in kilometers since it uses the Earth's radius in kilometers (6371 km);
function findNearbyUsers(prisma, longitude, latitude, radiusInKm) {
    return __awaiter(this, void 0, void 0, function* () {
        const nearbyUsers = yield prisma.$queryRaw `
    SELECT calculated_distances."userId", calculated_distances.longitude, calculated_distances.latitude, calculated_distances.distance, users."deviceType", users."deviceToken", users."notificationsEnabled", users."email"
    FROM (
      SELECT "userId", longitude, latitude,
            (6371 * acos(
                cos(radians(${latitude}))
                * cos(radians(latitude))
                * cos(radians(longitude) - radians(${longitude}))
                + sin(radians(${latitude})) * sin(radians(latitude))
            )) AS distance
      FROM locations
    ) AS calculated_distances
    JOIN users
    ON users.id = calculated_distances."userId"
    WHERE distance <= ${radiusInKm}
    ORDER BY distance;
  `;
        return nearbyUsers;
    });
}
exports.default = exports.notifyNearbyUsers;
