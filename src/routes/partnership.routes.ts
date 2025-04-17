import { Router, Request, Response, NextFunction } from 'express';
import partnershipController, { AuthenticatedRequest } from '../controllers/partnership.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { asyncHandler } from '../middlewares/error.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(AuthMiddleware.authenticateUser);

/**
 * @swagger
 * /api/partnerships:
 *   post:
 *     summary: Create a new partnership request
 *     description: Create a new partnership request between a course and a project
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseId
 *               - projectId
 *             properties:
 *               courseId:
 *                 type: string
 *                 description: MongoDB ID of the course to partner with
 *                 example: '65e3c2de7fd0e532d0b4a12a'
 *               projectId:
 *                 type: string
 *                 description: MongoDB ID of the project to partner with
 *                 example: '65e3c30e7fd0e532d0b4a12c'
 *               requestMessage:
 *                 type: string
 *                 description: Optional message to include with the partnership request
 *                 example: 'I would like to partner my course with your project'
 *     responses:
 *       201:
 *         description: Partnership request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Partnership request created successfully'
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request - invalid data or missing required fields
 *       401:
 *         description: Unauthorized - authentication required
 *       404:
 *         description: Course or project not found
 *       409:
 *         description: Conflict - partnership already exists or entities already in partnerships
 *       500:
 *         description: Internal server error
 */
router.post('/', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.createPartnershipRequest(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/pending:
 *   get:
 *     summary: Get pending partnership requests
 *     description: Get all pending partnership requests where the authenticated user is the recipient
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: List of pending partnership requests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   description: Number of pending partnership requests
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Partnership ID
 *                       courseId:
 *                         type: object
 *                         description: Course details
 *                       projectId:
 *                         type: object
 *                         description: Project details
 *                       status:
 *                         type: string
 *                         enum: [pending, approved, rejected, canceled, upcoming, ongoing, complete]
 *                       requestedByUserId:
 *                         type: string
 *                         description: User ID of the requester
 *                       requestedToUserId:
 *                         type: string
 *                         description: User ID of the recipient
 *                       requestMessage:
 *                         type: string
 *                         description: Message included with the request
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized - authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/pending', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getPendingPartnershipRequests(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/active:
 *   get:
 *     summary: Get active partnerships
 *     description: Get all active (approved) partnerships where the authenticated user is a participant
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: List of active partnerships
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   description: Number of active partnerships
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Partnership ID
 *                       courseId:
 *                         type: object
 *                         description: Course details
 *                       projectId:
 *                         type: object
 *                         description: Project details
 *                       status:
 *                         type: string
 *                         enum: [approved, upcoming, ongoing]
 *                       requestedByUserId:
 *                         type: string
 *                         description: User ID of the requester
 *                       requestedToUserId:
 *                         type: string
 *                         description: User ID of the recipient
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       approvedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized - authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/active', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getActivePartnerships(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/status/{status}:
 *   get:
 *     summary: Get partnerships by status
 *     description: Get all partnerships with a specific status where the authenticated user is a participant
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, canceled, upcoming, ongoing, complete]
 *         description: Partnership status to filter by
 *     responses:
 *       200:
 *         description: List of partnerships with the specified status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   description: Number of partnerships
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Partnership ID
 *                       courseId:
 *                         type: object
 *                         description: Course details
 *                       projectId:
 *                         type: object
 *                         description: Project details
 *                       status:
 *                         type: string
 *                         description: Partnership status
 *                       requestedByUserId:
 *                         type: string
 *                         description: User ID of the requester
 *                       requestedToUserId:
 *                         type: string
 *                         description: User ID of the recipient
 *       400:
 *         description: Bad request - invalid status value
 *       401:
 *         description: Unauthorized - authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/status/:status', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getPartnershipsByStatus(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/analytics:
 *   get:
 *     summary: Get partnership analytics
 *     description: Get aggregated analytics about partnerships across the platform (admin only)
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: Partnership analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: object
 *                         properties:
 *                           year:
 *                             type: integer
 *                             description: Year of partnership creation
 *                           quarter:
 *                             type: integer
 *                             description: Quarter of partnership creation (1-4)
 *                       total:
 *                         type: integer
 *                         description: Total number of partnerships
 *                       approved:
 *                         type: integer
 *                         description: Number of approved partnerships
 *                       rejected:
 *                         type: integer
 *                         description: Number of rejected partnerships
 *                       completed:
 *                         type: integer
 *                         description: Number of completed partnerships
 *                       avgApprovalTime:
 *                         type: number
 *                         description: Average approval time in days
 *                       avgLifecycleDuration:
 *                         type: number
 *                         description: Average partnership duration in days
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - admin access required
 *       500:
 *         description: Internal server error
 */
router.get('/analytics', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getPartnershipAnalytics(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/user:
 *   get:
 *     summary: Get all partnerships for the authenticated user
 *     description: Retrieve all partnerships where the authenticated user is either the requester or recipient, with optional status filtering
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, canceled, upcoming, ongoing, complete]
 *         description: Optional status filter to apply
 *     responses:
 *       200:
 *         description: User's partnerships
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   description: Number of partnerships
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Partnership ID
 *                       courseId:
 *                         type: object
 *                         description: Course details
 *                       projectId:
 *                         type: object
 *                         description: Project details
 *                       status:
 *                         type: string
 *                         description: Partnership status
 *                       requestedByUserId:
 *                         type: string
 *                         description: User ID of the requester
 *                       requestedToUserId:
 *                         type: string
 *                         description: User ID of the recipient
 *                       userRole:
 *                         type: string
 *                         enum: [requester, recipient]
 *                         description: The role of the authenticated user in this partnership
 *                 filter:
 *                   type: object
 *                   description: Applied filters
 *       400:
 *         description: Bad request - invalid status value
 *       401:
 *         description: Unauthorized - authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/user', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getUserPartnerships(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/{partnershipId}/approve:
 *   patch:
 *     summary: Approve a partnership request
 *     description: Approve a pending partnership request (only available to the partnership recipient)
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: partnershipId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the partnership to approve
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               responseMessage:
 *                 type: string
 *                 description: Optional response message to include with the approval
 *                 example: 'Looking forward to working with you on this partnership'
 *     responses:
 *       200:
 *         description: Partnership request approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Partnership request approved successfully'
 *                 data:
 *                   type: object
 *                   description: Updated partnership object
 *       400:
 *         description: Bad request - invalid partnership ID
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - only the request recipient can approve
 *       404:
 *         description: Partnership not found
 *       409:
 *         description: Conflict - course or project already in an active partnership
 *       500:
 *         description: Internal server error
 */
router.patch('/:partnershipId/approve', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  req.body.responseType = 'approve';
  await partnershipController.respondToPartnershipRequest(req as AuthenticatedRequest, res, next);
}));

/**
 * @swagger
 * /api/partnerships/{partnershipId}/reject:
 *   patch:
 *     summary: Reject a partnership request
 *     description: Reject a pending partnership request (only available to the partnership recipient)
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: partnershipId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the partnership to reject
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               responseMessage:
 *                 type: string
 *                 description: Optional response message to include with the rejection
 *                 example: 'Sorry, but we have already selected another project for this course'
 *     responses:
 *       200:
 *         description: Partnership request rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Partnership request rejected successfully'
 *                 data:
 *                   type: object
 *                   description: Updated partnership object
 *       400:
 *         description: Bad request - invalid partnership ID
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - only the request recipient can reject
 *       404:
 *         description: Partnership not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:partnershipId/reject', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  req.body.responseType = 'reject';
  await partnershipController.respondToPartnershipRequest(req as AuthenticatedRequest, res, next);
}));

/**
 * @swagger
 * /api/partnerships/{partnershipId}/cancel:
 *   patch:
 *     summary: Cancel a partnership request
 *     description: Cancel a pending partnership request (only available to the requester)
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: partnershipId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the partnership to cancel
 *     responses:
 *       200:
 *         description: Partnership request canceled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Partnership request canceled successfully'
 *                 data:
 *                   type: object
 *                   description: Updated partnership object
 *       400:
 *         description: Bad request - invalid partnership ID or not in pending status
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - only the requester can cancel
 *       404:
 *         description: Partnership not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:partnershipId/cancel', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.cancelPartnershipRequest(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/{partnershipId}/complete:
 *   patch:
 *     summary: Mark a partnership as complete
 *     description: Mark an active partnership as complete (available to both participants)
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: partnershipId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the partnership to complete
 *     responses:
 *       200:
 *         description: Partnership marked as complete successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Partnership completed successfully'
 *                 data:
 *                   type: object
 *                   description: Updated partnership object
 *       400:
 *         description: Bad request - invalid partnership ID
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - only participants can mark as complete
 *       404:
 *         description: Partnership not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:partnershipId/complete', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.completePartnership(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/{partnershipId}/dates:
 *   patch:
 *     summary: Update partnership dates
 *     description: Update the start and end dates for a partnership
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: partnershipId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the partnership to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 example: '2025-06-01T00:00:00.000Z'
 *                 description: New start date (must be before end date)
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 example: '2025-08-31T00:00:00.000Z'
 *                 description: New end date (must be after start date)
 *     responses:
 *       200:
 *         description: Partnership dates updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Partnership dates updated successfully'
 *                 data:
 *                   type: object
 *                   description: Updated partnership object
 *       400:
 *         description: Bad request - invalid dates or missing fields
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - only participants can update dates
 *       404:
 *         description: Partnership not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:partnershipId/dates', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.updatePartnershipDates(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/{partnershipId}/messages:
 *   post:
 *     summary: Send a message in a partnership
 *     description: Send a message in the partnership conversation (only available to participants)
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: partnershipId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the partnership
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: Message to send
 *                 example: 'How is the partnership progressing?'
 *     responses:
 *       200:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Message sent successfully'
 *                 data:
 *                   type: object
 *                   description: Updated partnership with new message
 *       400:
 *         description: Bad request - missing message
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - only participants can send messages
 *       404:
 *         description: Partnership not found
 *       500:
 *         description: Internal server error
 */
router.post('/:partnershipId/messages', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.sendPartnershipMessage(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/{partnershipId}/messages:
 *   get:
 *     summary: Get partnership conversation
 *     description: Get all messages in a partnership conversation (only available to participants)
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: partnershipId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the partnership
 *     responses:
 *       200:
 *         description: Partnership conversation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     partnershipId:
 *                       type: string
 *                       description: Partnership ID
 *                     courseId:
 *                       type: string
 *                       description: Course ID
 *                     projectId:
 *                       type: string
 *                       description: Project ID
 *                     status:
 *                       type: string
 *                       description: Partnership status
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                             description: User ID of the message sender
 *                           message:
 *                             type: string
 *                             description: Message content
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                             description: Message timestamp
 *       400:
 *         description: Bad request - invalid partnership ID
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - only participants can view messages
 *       404:
 *         description: Partnership not found
 *       500:
 *         description: Internal server error
 */
router.get('/:partnershipId/messages', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.getPartnershipConversation(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/{partnershipId}:
 *   patch:
 *     summary: Generic update partnership
 *     description: Generic endpoint to update a partnership (primarily for changing status)
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: partnershipId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the partnership
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - responseType
 *             properties:
 *               responseType:
 *                 type: string
 *                 enum: [approve, reject]
 *                 description: Type of response to the partnership request
 *               responseMessage:
 *                 type: string
 *                 description: Optional message to include with the response
 *     responses:
 *       200:
 *         description: Partnership updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Partnership request approved successfully'
 *                 data:
 *                   type: object
 *                   description: Updated partnership object
 *       400:
 *         description: Bad request - invalid input
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Partnership not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:partnershipId', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.respondToPartnershipRequest(req as AuthenticatedRequest, res, next)));

/**
 * @swagger
 * /api/partnerships/{partnershipId}:
 *   delete:
 *     summary: Delete a partnership
 *     description: Delete a partnership (same as cancel for pending partnerships)
 *     tags:
 *       - Partnerships
 *     security:
 *       - UserAuth: []
 *     parameters:
 *       - in: path
 *         name: partnershipId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the partnership
 *     responses:
 *       200:
 *         description: Partnership deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Partnership deleted successfully'
 *                 data:
 *                   type: object
 *                   description: Deleted partnership object
 *       400:
 *         description: Bad request - invalid partnership ID
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - permission denied
 *       404:
 *         description: Partnership not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:partnershipId', asyncHandler((req: Request, res: Response, next: NextFunction) => 
  partnershipController.cancelPartnershipRequest(req as AuthenticatedRequest, res, next)));

export default router;