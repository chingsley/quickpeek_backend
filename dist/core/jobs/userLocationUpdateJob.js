"use strict";
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
const client_1 = __importDefault(require("../database/prisma/client"));
const processUserLocationUpdate = (job) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, longitude, latitude } = job.data;
    try {
        yield client_1.default.location.upsert({
            where: {
                userId,
            },
            update: {
                longitude,
                latitude,
            },
            create: {
                longitude,
                latitude,
                userId,
            },
        });
        console.log(`Updated location for user ${userId}`);
    }
    catch (error) {
        console.error('Failed to update user location', error);
    }
});
exports.default = processUserLocationUpdate;
