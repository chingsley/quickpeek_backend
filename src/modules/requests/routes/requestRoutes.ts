import { Router } from 'express';
import { authenticateToken } from '../../../api/middlewares/authMiddleware';
import {
  createRequest,
  acceptRequest,
  rejectRequest,
  getIncomingRequests,
  getOutgoingRequests,
  getConversations,
  getRequestDetail,
  getRejectionReasons,
} from '../controllers/requestController';
import messageRoutes from '../../messages/routes/messageRoutes';
import reviewRoutes from '../../reviews/routes/reviewRoutes';

const router = Router();

// Responder creates a request on a question
// Mounted under /questions so this is added to questionRoutes as well.
// Here we expose the per-request endpoints.
router.post('/:id/accept', authenticateToken, acceptRequest);
router.post('/:id/reject', authenticateToken, rejectRequest);

router.get('/incoming', authenticateToken, getIncomingRequests);
router.get('/outgoing', authenticateToken, getOutgoingRequests);
router.get('/conversations', authenticateToken, getConversations);
router.get('/rejection-reasons', authenticateToken, getRejectionReasons);

router.get('/:id', authenticateToken, getRequestDetail);

// Nested chat + reviews on a request
router.use('/:id/messages', authenticateToken, messageRoutes);
router.use('/:id', reviewRoutes);

export default router;
