import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import {
  createPaymentAccount,
  getAccountStatus,
  getWallet,
  listBanks,
  payForRequest,
  startOnboarding,
  verifyPayment,
} from '../controllers/paymentController';
import {
  validateOnboarding,
  validatePaymentAccountCreation,
  validatePaymentInitiation,
  validatePaymentVerification,
} from '../middlewares/paymentMiddleware';

const router = Router();

router.post('/accounts', authenticateToken, validatePaymentAccountCreation, createPaymentAccount);
router.post('/accounts/onboarding', authenticateToken, validateOnboarding, startOnboarding);
router.get('/accounts/status', authenticateToken, getAccountStatus);
router.get('/banks', authenticateToken, listBanks);
router.post('/pay', authenticateToken, validatePaymentInitiation, payForRequest);
router.post('/pay/verify', authenticateToken, validatePaymentVerification, verifyPayment);
router.get('/wallet', authenticateToken, getWallet);

export default router;
