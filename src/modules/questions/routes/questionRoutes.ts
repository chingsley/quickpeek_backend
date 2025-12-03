// src / modules / questions / routes / questionRoutes.ts;
import {
  createAnswerForQuestion, getAnswersByQuestionId,
  getAnsweredQuestions, getNearbyQuestions,
  createQuestion, getUserPostedQuestions,
  getPendingQuestions,
  claimQuestion
} from './../controllers/questionController';
import {
  validateQuestionCreation, validateAnswerCreation,
  validateGetNearbyQuestionsPayload,
} from './../middlewares/questionMiddleware';
import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';


const router = Router();

router.post('/', authenticateToken, validateQuestionCreation, createQuestion); // Create question
router.get('/', authenticateToken, getUserPostedQuestions); // Get all questions by user ID *** userId is gotten from token, this should be paginated as user may have posted many questions. Maybe get 10 most recent questions
router.get('/answered', authenticateToken, getAnsweredQuestions); // Get all questions answered by a user
router.get('/nearby', authenticateToken, validateGetNearbyQuestionsPayload, getNearbyQuestions);
router.post('/:questionId/claim', authenticateToken, claimQuestion);
router.post('/:questionId/answer', authenticateToken, validateAnswerCreation, createAnswerForQuestion);
router.get('/:questionId/answers', authenticateToken, getAnswersByQuestionId);
// router.get('/myQuestions', authenticateToken, getMyQuestions); // a paginated endpoint that returns a user's own questions


/**
 * This endpoint will likely be updated later to get a user's pending questions by querying the the 'pending_questions'
 * table using the userId. The userId will be gotten from the token of the logged-in user. For now, we use questionIds from query
 */
router.get('/pending', authenticateToken, getPendingQuestions); // get /questions/pending?questionIds=id1,id2,id3 // should acccept a max of 3 uuid's as query params.

export default router;
