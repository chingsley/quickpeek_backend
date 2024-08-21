import { Router } from 'express';
import { createQuestion, getAllQuestionsByUserId } from '../controllers/questionController';

const router = Router();

router.post('/', createQuestion); // Create question
router.get('/users/:userId/questions', getAllQuestionsByUserId); // Get all questions by user ID *** Move this to users route: /users/:userId/questions

export default router;
