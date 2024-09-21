import { authenticateToken } from './../../../api/middlewares/authMiddleware';
import { Router } from 'express';
import { registerUser, loginUser, updateUserLocation } from '../controllers/userController';
import { validateUserRegistration, validateUserLogin, validateUserLocation } from '../middlewares/userMiddleware';

const router = Router();

router.post('/', validateUserRegistration, registerUser);
router.post('/login', validateUserLogin, loginUser);
router.post('/location', authenticateToken, validateUserLocation, updateUserLocation);
// other endpoints:
// user can view their profile:
// user can update their profile: change username (maybe), change notificationsEnabled, etc

export default router;
