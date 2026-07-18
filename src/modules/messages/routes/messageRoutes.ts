import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import {
  sendMessage,
  getMessages,
  markMessagesRead,
  getQuestionThread,
} from '../controllers/messageController';
import { validateSendMessage } from '../middlewares/messageMiddleware';

const router = Router({ mergeParams: true });

router.get('/thread', authenticateToken, getQuestionThread);
router.get('/', authenticateToken, getMessages);
router.post('/', authenticateToken, validateSendMessage, sendMessage);
router.post('/read', authenticateToken, markMessagesRead);

export default router;
