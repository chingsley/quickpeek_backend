import { authenticateToken } from './../../../api/middlewares/authMiddleware';
import { Router } from 'express';
import { registerUser, loginUser, updateUserLocation } from '../controllers/userController';
import { validateUserRegistration, validateUserLogin, validateUserLocation } from '../middlewares/userMiddleware';

const router = Router();

router.post('/register', validateUserRegistration, registerUser);
router.post('/login', validateUserLogin, loginUser);
router.post('/location', authenticateToken, validateUserLocation, updateUserLocation);

export default router;
