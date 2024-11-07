import { Router } from 'express';

import { authenticateToken } from './../../../api/middlewares/authMiddleware';
import { validateAnswerRatingsCreation } from './../middlewares/ratingsMiddleware';
import { rateAnswer } from '../controllers/ratingsController';


const router = Router();

router.post('/', authenticateToken, validateAnswerRatingsCreation, rateAnswer); // Create question

export default router;

