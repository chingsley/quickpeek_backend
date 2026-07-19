import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import {
  getReviewEligibility,
  submitReview,
  getMyReviewForRequest,
} from '../controllers/reviewController';
import { validateSubmitReview } from '../middlewares/reviewMiddleware';

const router = Router({ mergeParams: true });

router.get('/review-eligibility', authenticateToken, getReviewEligibility);
router.get('/my-review', authenticateToken, getMyReviewForRequest);
router.post('/reviews', authenticateToken, validateSubmitReview, submitReview);

export default router;
