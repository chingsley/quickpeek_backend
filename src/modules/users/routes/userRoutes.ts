import { authenticateToken } from './../../../api/middlewares/authMiddleware';
import { Router } from 'express';
import {
  registerUser,
  loginUser,
  updateUserLocation,
  getUserProfile,
  updateUserProfile,
  uploadUserProfileImage,
  getNearbyResponders,
} from '../controllers/userController';
import { answerImageUpload } from '../../../api/middlewares/uploadMiddleware';
import {
  validateUserRegistration,
  validateUserLogin,
  validateUserLocation,
  validateUserProfileUpdate,
  validateNearbyRespondersQuery,
} from '../middlewares/userMiddleware';

const router = Router();

// Auth + location
router.post('/', validateUserRegistration, registerUser);
router.post('/login', validateUserLogin, loginUser);
router.post('/location', authenticateToken, validateUserLocation, updateUserLocation);

// Profile (authenticated user)
router.get('/', authenticateToken, getUserProfile);
router.put('/', authenticateToken, validateUserProfileUpdate, updateUserProfile);
router.post('/profile-image', authenticateToken, answerImageUpload, uploadUserProfileImage);

// Browse responders (responder-selection flow)
router.get('/nearby', authenticateToken, validateNearbyRespondersQuery, getNearbyResponders);

export default router;
