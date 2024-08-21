import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import { createQuestion, getAllQuestionsByUserId } from '../controllers/questionController';

const router = Router();

router.post('/', authenticateToken, createQuestion); // Create question
router.get('/questions', authenticateToken, getAllQuestionsByUserId); // Get all questions by user ID *** Move this to users route: /users/:userId/questions

export default router;
