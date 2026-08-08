import { authenticateToken } from './../../../api/middlewares/authMiddleware';
import { Router } from 'express';
import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  updateUserLocation,
  uploadUserProfileImage,
  getPublicUserProfile,
} from '../controllers/userController';
import { profileImageUpload } from '../../../api/middlewares/uploadMiddleware';
import {
  validateUserRegistration,
  validateUserLogin,
  validateUserProfileUpdate,
  validateLocationUpdate,
} from '../middlewares/userMiddleware';

const router = Router();

// Auth
router.post('/', validateUserRegistration, registerUser);
router.post('/login', validateUserLogin, loginUser);

// Profile (authenticated user)
router.get('/', authenticateToken, getUserProfile);
router.put('/', authenticateToken, validateUserProfileUpdate, updateUserProfile);
router.put('/location', authenticateToken, validateLocationUpdate, updateUserLocation);
router.post('/profile-image', authenticateToken, profileImageUpload, uploadUserProfileImage);

// Public profile
router.get('/:id/profile', authenticateToken, getPublicUserProfile);

export default router;
