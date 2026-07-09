// src / modules / questions / routes / questionRoutes.ts;
import {
  createAnswerForQuestion, getAnswersByQuestionId,
  getAnsweredQuestions, getNearbyQuestions,
  createQuestion, getUserPostedQuestions,
  getPendingQuestions,
  claimQuestion,
  assignQuestion,
  reassignQuestion,
  getAssignedQuestions,
} from './../controllers/questionController';
import {
  validateQuestionCreation, validateAnswerCreation,
  validateGetNearbyQuestionsPayload,
  validateAssignQuestion,
  validateReassignQuestion,
} from './../middlewares/questionMiddleware';
import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import { answerImageUpload } from '../../../api/middlewares/uploadMiddleware';
import {
  questionCreationLimiter,
  nearbyReadLimiter,
  answerSubmissionLimiter,
} from '../../../api/middlewares/rateLimitMiddleware';
import Joi from 'joi';

const router = Router();

/**
 * Answer-submission middleware: accepts either multipart/form-data (with an
 * optional `image` file and text fields) or application/json. In the multipart
 * case multer populates req.body with the text fields, then we run the same
 * Joi validation on the resulting body.
 */
const answerSubmission = (req: Request, res: Response, next: NextFunction) => {
  const isMultipart = (req.headers['content-type'] || '').startsWith('multipart/');
  if (!isMultipart) {
    return validateAnswerCreation(req, res, next);
  }
  answerImageUpload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    // Normalize text field: multer puts it in req.body.text (possibly as an array).
    const text = Array.isArray(req.body.text) ? req.body.text[0] : req.body.text;
    const { error } = Joi.object({ text: Joi.string().required() }).validate({ text });
    if (error) return res.status(400).json({ error: error.details[0].message });
    req.body.text = text;
    next();
  });
};

router.post('/', authenticateToken, questionCreationLimiter, validateQuestionCreation, createQuestion); // Create question DRAFT
router.get('/', authenticateToken, getUserPostedQuestions);
router.get('/answered', authenticateToken, getAnsweredQuestions);
router.get('/assigned', authenticateToken, getAssignedQuestions); // Responder inbox
router.get('/nearby', authenticateToken, nearbyReadLimiter, validateGetNearbyQuestionsPayload, getNearbyQuestions);
router.post('/:questionId/assign', authenticateToken, questionCreationLimiter, validateAssignQuestion, assignQuestion);
router.post('/:questionId/reassign', authenticateToken, questionCreationLimiter, validateReassignQuestion, reassignQuestion);
router.post('/:questionId/claim', authenticateToken, claimQuestion); // legacy race-to-claim (deprecated)
router.post('/:questionId/answer', authenticateToken, answerSubmissionLimiter, answerSubmission, createAnswerForQuestion);
router.get('/:questionId/answers', authenticateToken, getAnswersByQuestionId);

router.get('/pending', authenticateToken, getPendingQuestions);

export default router;
