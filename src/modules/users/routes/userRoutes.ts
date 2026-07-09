import { authenticateToken } from './../../../api/middlewares/authMiddleware';
import { Router } from 'express';
import {
  registerUser,
  loginUser,
  updateUserLocation,
  getUserProfile,
  updateUserProfile,
  getNearbyResponders,
} from '../controllers/userController';
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

// Browse responders (responder-selection flow)
router.get('/nearby', authenticateToken, validateNearbyRespondersQuery, getNearbyResponders);

export default router;
