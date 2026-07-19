import { authenticateToken } from './../../../api/middlewares/authMiddleware';
import { Router } from 'express';
import {
  registerUser,
  loginUser,
  updateUserLocation,
  getUserProfile,
  updateUserProfile,
  uploadUserProfileImage,
  getPublicUserProfile,
} from '../controllers/userController';
import { profileImageUpload } from '../../../api/middlewares/uploadMiddleware';
import {
  validateUserRegistration,
  validateUserLogin,
  validateUserLocation,
  validateUserProfileUpdate,
} from '../middlewares/userMiddleware';

const router = Router();

// Auth + location
router.post('/', validateUserRegistration, registerUser);
router.post('/login', validateUserLogin, loginUser);
router.post('/location', authenticateToken, validateUserLocation, updateUserLocation);

// Profile (authenticated user)
router.get('/', authenticateToken, getUserProfile);
router.put('/', authenticateToken, validateUserProfileUpdate, updateUserProfile);
router.post('/profile-image', authenticateToken, profileImageUpload, uploadUserProfileImage);

// Public profile
router.get('/:id/profile', authenticateToken, getPublicUserProfile);

export default router;
