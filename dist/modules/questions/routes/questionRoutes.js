"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src / modules / questions / routes / questionRoutes.ts
const express_1 = require("express");
const authMiddleware_1 = require("../../../api/middlewares/authMiddleware");
const rateLimitMiddleware_1 = require("../../../api/middlewares/rateLimitMiddleware");
const optionalAuthMiddleware_1 = require("../../../api/middlewares/optionalAuthMiddleware");
const questionController_1 = require("../controllers/questionController");
const questionMiddleware_1 = require("../middlewares/questionMiddleware");
const requestController_1 = require("../../requests/controllers/requestController");
const router = (0, express_1.Router)();
// Public feed (optional auth for personalized sections)
router.get('/feed', optionalAuthMiddleware_1.optionalAuthenticateToken, questionController_1.getQuestionFeed);
// Public search (optional auth for viewer enrichment)
router.get('/search', optionalAuthMiddleware_1.optionalAuthenticateToken, questionController_1.searchQuestions);
// Authenticated
router.post('/', authMiddleware_1.authenticateToken, rateLimitMiddleware_1.questionCreationLimiter, questionMiddleware_1.validateQuestionCreation, questionController_1.createQuestion);
router.get('/mine/closed', authMiddleware_1.authenticateToken, questionController_1.getUserClosedQuestions);
router.get('/mine', authMiddleware_1.authenticateToken, questionController_1.getUserPostedQuestions);
router.get('/close-reasons', authMiddleware_1.authenticateToken, questionController_1.getCloseReasons);
// Per-question
router.get('/:id/rejected-responders', authMiddleware_1.authenticateToken, questionController_1.getRejectedResponders);
router.delete('/:id/rejected-responders/:responderId', authMiddleware_1.authenticateToken, questionController_1.unblockResponder);
router.get('/:id', authMiddleware_1.authenticateToken, questionController_1.getQuestionDetail);
router.post('/:id/close', authMiddleware_1.authenticateToken, questionController_1.closeQuestion);
router.post('/:id/requests', authMiddleware_1.authenticateToken, requestController_1.createRequest);
exports.default = router;
