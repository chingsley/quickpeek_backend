import { Router } from 'express';
import { registerUser, loginUser } from '../controllers/userController';
import { validateUserRegistration, validateUserLogin } from '../middlewares/userMiddleware';

const router = Router();

router.post('/register', validateUserRegistration, registerUser);
router.post('/login', validateUserLogin, loginUser);

export default router;
