"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../../../api/middlewares/authMiddleware");
const requestController_1 = require("../controllers/requestController");
const messageRoutes_1 = __importDefault(require("../../messages/routes/messageRoutes"));
const reviewRoutes_1 = __importDefault(require("../../reviews/routes/reviewRoutes"));
const router = (0, express_1.Router)();
// Responder creates a request on a question
// Mounted under /questions so this is added to questionRoutes as well.
// Here we expose the per-request endpoints.
router.post('/:id/accept', authMiddleware_1.authenticateToken, requestController_1.acceptRequest);
router.post('/:id/reject', authMiddleware_1.authenticateToken, requestController_1.rejectRequest);
router.get('/incoming', authMiddleware_1.authenticateToken, requestController_1.getIncomingRequests);
router.get('/outgoing', authMiddleware_1.authenticateToken, requestController_1.getOutgoingRequests);
router.get('/conversations', authMiddleware_1.authenticateToken, requestController_1.getConversations);
router.get('/rejection-reasons', authMiddleware_1.authenticateToken, requestController_1.getRejectionReasons);
router.get('/:id', authMiddleware_1.authenticateToken, requestController_1.getRequestDetail);
// Nested chat + reviews on a request
router.use('/:id/messages', authMiddleware_1.authenticateToken, messageRoutes_1.default);
router.use('/:id', reviewRoutes_1.default);
exports.default = router;
