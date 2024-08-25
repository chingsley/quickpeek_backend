import { createAnswerForQuestion } from './../controllers/questionController';
import { validateQuestionCreation, validateAnswerCreation } from './../middlewares/questionMiddleware';
import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import { createQuestion, getAllQuestionsByUserId } from '../controllers/questionController';

const router = Router();

router.post('/', authenticateToken, validateQuestionCreation, createQuestion); // Create question
router.get('/', authenticateToken, getAllQuestionsByUserId); // Get all questions by user ID *** userId is gotten from token
router.post('/:quesitonID/answer', authenticateToken, validateAnswerCreation, createAnswerForQuestion);

export default router;
