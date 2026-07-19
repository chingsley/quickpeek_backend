import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import { requireAdmin } from '../../../api/middlewares/adminMiddleware';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController';
import {
  validateCreateCategory,
  validateUpdateCategory,
} from '../middlewares/categoryMiddleware';

const router = Router();

// Public
router.get('/', listCategories);

// Admin only
router.post('/', authenticateToken, requireAdmin, validateCreateCategory, createCategory);
router.put('/:id', authenticateToken, requireAdmin, validateUpdateCategory, updateCategory);
router.delete('/:id', authenticateToken, requireAdmin, deleteCategory);

export default router;
