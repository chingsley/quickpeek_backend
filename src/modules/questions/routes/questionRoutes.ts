// src / modules / questions / routes / questionRoutes.ts
import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import { questionCreationLimiter } from '../../../api/middlewares/rateLimitMiddleware';
import { optionalAuthenticateToken } from '../../../api/middlewares/optionalAuthMiddleware';
import {
  createQuestion,
  getQuestionFeed,
  searchQuestions,
  getUserPostedQuestions,
  getQuestionDetail,
  closeQuestion,
  getCloseReasons,
  getRejectedResponders,
  unblockResponder,
} from '../controllers/questionController';
import { validateQuestionCreation } from '../middlewares/questionMiddleware';
import { createRequest } from '../../requests/controllers/requestController';

const router = Router();

// Public feed (optional auth for personalized sections)
router.get('/feed', optionalAuthenticateToken, getQuestionFeed);

// Public search (optional auth for viewer enrichment)
router.get('/search', optionalAuthenticateToken, searchQuestions);

// Authenticated
router.post('/', authenticateToken, questionCreationLimiter, validateQuestionCreation, createQuestion);
router.get('/mine', authenticateToken, getUserPostedQuestions);
router.get('/close-reasons', authenticateToken, getCloseReasons);

// Per-question
router.get('/:id/rejected-responders', authenticateToken, getRejectedResponders);
router.delete('/:id/rejected-responders/:responderId', authenticateToken, unblockResponder);
router.get('/:id', authenticateToken, getQuestionDetail);
router.post('/:id/close', authenticateToken, closeQuestion);
router.post('/:id/requests', authenticateToken, createRequest);

export default router;
