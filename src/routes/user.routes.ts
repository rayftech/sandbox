// src/routes/user.routes.ts
import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Apply authentication middleware to all user routes
router.use(AuthMiddleware.authenticateUser);

/**
 * @swagger
 * /api/users/{userId}/profile:
 *   get:
 *     summary: Get user profile
 *     description: Retrieve a user's profile information
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: 'success'
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                       example: '399ee4d8-c081-7025-f7fb-b98931232178'
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: 'raymondf0123@gmail.com'
 *                     firstName:
 *                       type: string
 *                       example: 'JunJie'
 *                     lastName:
 *                       type: string
 *                       example: 'Fu'
 *                     userType:
 *                       type: string
 *                       enum: [academic, industry, admin]
 *                       example: 'academic'
 *                     profileSettings:
 *                       type: object
 *                       properties:
 *                         visibility:
 *                           type: string
 *                           enum: [public, private, friends-only]
 *                           example: 'public'
 *                         allowFriendRequests:
 *                           type: boolean
 *                           example: true
 *                         emailNotifications:
 *                           type: boolean
 *                           example: true
 *                     lastLogin:
 *                       type: string
 *                       format: date-time
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     totalCoursesCreated:
 *                       type: integer
 *                       example: 5
 *                     totalProjectsCreated:
 *                       type: integer
 *                       example: 0
 *                     totalPartnershipsInitiated:
 *                       type: integer
 *                       example: 3
 *                     totalPartnershipsReceived:
 *                       type: integer
 *                       example: 2
 *                     successRate:
 *                       type: number
 *                       example: 75
 *       400:
 *         description: Bad request - missing userId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:userId/profile', UserController.getUserProfile);

/**
 * @swagger
 * /api/users/{userId}/profile-settings:
 *   patch:
 *     summary: Update profile settings
 *     description: Update a user's profile settings
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     security:
 *       - UserAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - profileSettings
 *             properties:
 *               profileSettings:
 *                 type: object
 *                 properties:
 *                   visibility:
 *                     type: string
 *                     enum: [public, private, friends-only]
 *                   allowFriendRequests:
 *                     type: boolean
 *                   emailNotifications:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Profile settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: 'success'
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                       example: '399ee4d8-c081-7025-f7fb-b98931232178'
 *                     profileSettings:
 *                       type: object
 *                       properties:
 *                         visibility:
 *                           type: string
 *                           enum: [public, private, friends-only]
 *                           example: 'public'
 *                         allowFriendRequests:
 *                           type: boolean
 *                           example: true
 *                         emailNotifications:
 *                           type: boolean
 *                           example: true
 *       400:
 *         description: Bad request - missing userId or profileSettings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:userId/profile-settings', UserController.updateProfileSettings);

/**
 * @swagger
 * /api/users/{userId}/record-login:
 *   post:
 *     summary: Record user login
 *     description: Record a user login event and update the last login timestamp
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: Login recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: 'success'
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                       example: '399ee4d8-c081-7025-f7fb-b98931232178'
 *                     lastLogin:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - missing userId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:userId/record-login', UserController.recordLogin);

/**
 * @swagger
 * /api/users/admin/all-users:
 *   get:
 *     summary: Get all users (Admin only)
 *     description: Admin-only endpoint to retrieve all users
 *     tags:
 *       - Users
 *     security:
 *       - UserAuth: []
 *     responses:
 *       501:
 *         description: Not implemented yet
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'Not implemented yet'
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/admin/all-users',
  AuthMiddleware.requireAdmin,
  (_req, res) => {
    // Admin-only endpoint to get all users
    // To be implemented
    res.status(501).json({ message: 'Not implemented yet' });
  }
);

export default router;