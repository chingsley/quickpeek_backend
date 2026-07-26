import { authenticateToken } from './../../../api/middlewares/authMiddleware';
import { Router } from 'express';
import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  uploadUserProfileImage,
  getPublicUserProfile,
} from '../controllers/userController';
import { profileImageUpload } from '../../../api/middlewares/uploadMiddleware';
import {
  validateUserRegistration,
  validateUserLogin,
  validateUserProfileUpdate,
} from '../middlewares/userMiddleware';

const router = Router();

// Auth
router.post('/', validateUserRegistration, registerUser);
router.post('/login', validateUserLogin, loginUser);

// Profile (authenticated user)
router.get('/', authenticateToken, getUserProfile);
router.put('/', authenticateToken, validateUserProfileUpdate, updateUserProfile);
router.post('/profile-image', authenticateToken, profileImageUpload, uploadUserProfileImage);

// Public profile
router.get('/:id/profile', authenticateToken, getPublicUserProfile);

export default router;
