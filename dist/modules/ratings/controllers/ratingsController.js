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
exports.rateAnswer = void 0;
const client_1 = require("@prisma/client");
const client_2 = __importDefault(require("../../../core/database/prisma/client"));
const userRatingsUpdateQueue_1 = require("../../../core/queues/userRatingsUpdateQueue");
const index_1 = require("./../../../common/constants/index");
const rateAnswer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { answerId, rating, feedback } = req.body;
        const answer = yield client_2.default.answer.findUnique({
            where: { id: answerId },
            include: {
                user: {
                    select: {
                        id: true,
                    }
                },
                question: {
                    select: {
                        id: true,
                        userId: true
                    }
                }
            }
        });
        if (!answer) {
            return res.status(400).json({
                message: `no answer found for id: ${answerId}`,
                code: 'R001'
            });
        }
        if (answer.question.userId !== req.user.userId) {
            return res.status(401).json({
                message: `Authorization failed. You cannot rate this answer`,
                code: 'R002'
            });
        }
        const answerRating = yield client_2.default.answerRating.create({
            data: { answerId, rating, feedback }
        });
        userRatingsUpdateQueue_1.userRatingsUpdateQueue.add({
            userId: answer.user.id,
            rating
        });
        res.status(201).json({
            message: 'Ratings saved',
            data: answerRating,
        });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            // Handle unique constraint violation (P2002)
            if (error.code === index_1.PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE) {
                const uniqueField = (_a = error.meta) === null || _a === void 0 ? void 0 : _a.target;
                let errorMessage = 'Unique constraint violation';
                if (uniqueField && uniqueField.includes('answerId')) {
                    errorMessage = 'This answer has already been rated';
                }
                return res.status(400).json({ error: errorMessage });
            }
        }
        res.status(500).json({ error: 'Failed to create answer rating' });
    }
});
exports.rateAnswer = rateAnswer;
