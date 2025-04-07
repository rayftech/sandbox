import { Router, Request, Response, NextFunction } from 'express';
import partnershipController, { AuthenticatedRequest } from '../controllers/partnership.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { asyncHandler } from '../middlewares/error.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(AuthMiddleware.authenticateUser);

// Create a new partnership request
router.post('/', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.createPartnershipRequest(req as AuthenticatedRequest, res, next)));

// Get partnerships with various filters
router.get('/pending', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getPendingPartnershipRequests(req as AuthenticatedRequest, res, next)));
router.get('/active', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getActivePartnerships(req as AuthenticatedRequest, res, next)));
router.get('/status/:status', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getPartnershipsByStatus(req as AuthenticatedRequest, res, next)));
router.get('/analytics', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getPartnershipAnalytics(req as AuthenticatedRequest, res, next)));

// Partnership status management
router.patch('/:partnershipId/approve', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  req.body.responseType = 'approve';
  await partnershipController.respondToPartnershipRequest(req as AuthenticatedRequest, res, next);
}));

router.patch('/:partnershipId/reject', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  req.body.responseType = 'reject';
  await partnershipController.respondToPartnershipRequest(req as AuthenticatedRequest, res, next);
}));

router.patch('/:partnershipId/cancel', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.cancelPartnershipRequest(req as AuthenticatedRequest, res, next)));
router.patch('/:partnershipId/complete', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.completePartnership(req as AuthenticatedRequest, res, next)));
router.patch('/:partnershipId/dates', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.updatePartnershipDates(req as AuthenticatedRequest, res, next)));

// Messaging
router.post('/:partnershipId/messages', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.sendPartnershipMessage(req as AuthenticatedRequest, res, next)));
router.get('/:partnershipId/messages', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getPartnershipConversation(req as AuthenticatedRequest, res, next)));

// Generic partnership operations
router.patch('/:partnershipId', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.respondToPartnershipRequest(req as AuthenticatedRequest, res, next)));
router.delete('/:partnershipId', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.cancelPartnershipRequest(req as AuthenticatedRequest, res, next)));

export default router;