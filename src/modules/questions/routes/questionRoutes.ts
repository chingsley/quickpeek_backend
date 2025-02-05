import { createAnswerForQuestion, getAnswersByQuestionId } from './../controllers/questionController';
import { validateQuestionCreation, validateAnswerCreation } from './../middlewares/questionMiddleware';
import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import { createQuestion, getAllQuestionsByUserId, getPendingQuestions } from '../controllers/questionController';

const router = Router();

router.post('/', authenticateToken, validateQuestionCreation, createQuestion); // Create question
router.get('/', authenticateToken, getAllQuestionsByUserId); // Get all questions by user ID *** userId is gotten from token, this should be paginated as user may have posted many questions. Maybe get 10 most recent questions
router.post('/:questionId/answer', authenticateToken, validateAnswerCreation, createAnswerForQuestion);
router.get('/:questionId/answers', authenticateToken, getAnswersByQuestionId);
// router.get('/myQuestions', authenticateToken, getMyQuestions); // a paginated endpoint that returns a user's own questions


/**
 * This endpoint will likely be updated later to get a user's pending questions by querying the the 'pending_questions'
 * table using the userId. The userId will be gotten from the token of the logged-in user. For now, we use questionIds from query
 */
router.get('/pending', authenticateToken, getPendingQuestions); // get /questions/pending?questionIds=id1,id2,id3 // should acccept a max of 3 uuid's as query params.

export default router;
