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
const client_1 = require("@prisma/client");
const client_2 = __importDefault(require("../database/prisma/client"));
/**
 * Periodic cleanup of stale OPEN questions.
 *
 * Closes OPEN questions older than `QUESTION_DRAFT_TTL_HOURS` (default 24h).
 * (Under the request-to-answer model there is no EXPIRED state and no per-question
 * TTR timeout, so this is a single best-effort GC pass.)
 */
const cleanupQuestions = (_job) => __awaiter(void 0, void 0, void 0, function* () {
    const draftTtlHours = parseInt(process.env.QUESTION_DRAFT_TTL_HOURS || '24', 10);
    const cutoff = new Date(Date.now() - draftTtlHours * 60 * 60 * 1000);
    const now = new Date();
    const result = yield client_2.default.question.updateMany({
        where: {
            status: client_1.QuestionStatus.OPEN,
            createdAt: { lt: cutoff },
        },
        data: {
            status: client_1.QuestionStatus.CLOSED,
            closeReason: 'Automatically closed (expired)',
            closedAt: now,
        },
    });
    console.log(`questionCleanup: closed ${result.count} stale OPEN questions`);
});
exports.default = cleanupQuestions;
