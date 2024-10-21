import { Router } from 'express';
import { checkHealth } from '../controllers/healthController';
import { checkCacheHealth } from '../controllers/healthController';

const router = Router();

router.get('/', checkHealth);
router.get('/cache-health', checkCacheHealth);

export default router;
