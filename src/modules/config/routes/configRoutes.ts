import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import { requireAdmin } from '../../../api/middlewares/adminMiddleware';
import { getMarketConfig, updateMarketConfig } from '../controllers/configController';
import { validateMarketConfigUpdate } from '../middlewares/configMiddleware';

const router = Router();

// Public
router.get('/', getMarketConfig);

// Admin-only
router.put('/', authenticateToken, requireAdmin, validateMarketConfigUpdate, updateMarketConfig);

export default router;
