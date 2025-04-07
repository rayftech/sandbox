import { Router } from 'express';
import partnershipController from '../controllers/partnership.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Create a new partnership request
router.post('/', partnershipController.createPartnershipRequest);

// Get partnerships with various filters
router.get('/pending', partnershipController.getPendingPartnershipRequests);
router.get('/active', partnershipController.getActivePartnerships);
router.get('/status/:status', partnershipController.getPartnershipsByStatus);
router.get('/analytics', partnershipController.getPartnershipAnalytics);

// Partnership status management
router.patch('/:partnershipId/approve', (req, res, next) => {
  req.body.responseType = 'approve';
  partnershipController.respondToPartnershipRequest(req, res, next);
});

router.patch('/:partnershipId/reject', (req, res, next) => {
  req.body.responseType = 'reject';
  partnershipController.respondToPartnershipRequest(req, res, next);
});

router.patch('/:partnershipId/cancel', partnershipController.cancelPartnershipRequest);
router.patch('/:partnershipId/complete', partnershipController.completePartnership);
router.patch('/:partnershipId/dates', partnershipController.updatePartnershipDates);

// Messaging
router.post('/:partnershipId/messages', partnershipController.sendPartnershipMessage);
router.get('/:partnershipId/messages', partnershipController.getPartnershipConversation);

// Generic partnership operations
router.patch('/:partnershipId', partnershipController.respondToPartnershipRequest);
router.delete('/:partnershipId', partnershipController.cancelPartnershipRequest);

export default router;