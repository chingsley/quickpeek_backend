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
const firebase_push_1 = require("../messaging/firebase.push");
const sendAnswerToquestionCreator = (job) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { questionId, answerContent, responderId } = job.data;
        const responder = yield client_1.default.user.findUnique({ where: { id: responderId } });
        if (!responder)
            throw Error(`Responder with id: ${responderId} not found`);
        const question = yield client_1.default.question.findUnique({
            where: {
                id: questionId,
            },
            include: {
                user: {
                    select: {
                        deviceToken: true,
                        deviceType: true,
                        notificationsEnabled: true
                    },
                },
            },
        });
        if (!question || !question.user) {
            throw new Error('Question or associated user not found');
        }
        const { user } = question;
        if (!user.notificationsEnabled)
            return;
        const payload = {
            body: answerContent,
            data: {
                questionId,
                responderId,
                responderUsername: responder.username,
                // responderRatings: responder.ratings.value // include responder rating here
            }
        };
        yield (0, firebase_push_1.sendNotification)(user.deviceToken, payload);
    }
    catch (error) {
        console.error('Failed to send question to nearby users', error);
    }
});
exports.default = sendAnswerToquestionCreator;
