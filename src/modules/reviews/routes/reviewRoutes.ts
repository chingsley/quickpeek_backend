import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import {
  getReviewEligibility,
  submitReview,
  markQuestionAnswered,
  getMyReviewForQuestion,
} from '../controllers/reviewController';
import { setResponseWindow } from '../../questions/controllers/questionWindowController';
import { validateSubmitReview } from '../middlewares/reviewMiddleware';
import { validateSetResponseWindow } from '../../questions/middlewares/questionWindowMiddleware';

const router = Router({ mergeParams: true });

router.get('/review-eligibility', authenticateToken, getReviewEligibility);
router.get('/my-review', authenticateToken, getMyReviewForQuestion);
router.post('/reviews', authenticateToken, validateSubmitReview, submitReview);
router.post('/answered', authenticateToken, markQuestionAnswered);
router.post('/response-window', authenticateToken, validateSetResponseWindow, setResponseWindow);

export default router;
