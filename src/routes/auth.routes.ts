// src/routes/auth.routes.ts
import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();

/**
 * @swagger
 * /api/auth/sync:
 *   post:
 *     summary: Synchronize user data
 *     description: Synchronizes user data from Amplify after login/registration
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - email
 *               - firstName
 *               - lastName
 *               - userType
 *             properties:
 *               userId:
 *                 type: string
 *                 example: '399ee4d8-c081-7025-f7fb-b98931232178'
 *               email:
 *                 type: string
 *                 format: email
 *                 example: 'raymondf0123@gmail.com'
 *               firstName:
 *                 type: string
 *                 example: 'JunJie'
 *               lastName:
 *                 type: string
 *                 example: 'Fu'
 *               userType:
 *                 type: string
 *                 enum: [academic, industry, admin]
 *                 example: 'academic'
 *               isAdmin:
 *                 type: boolean
 *                 example: false
 *               country:
 *                 type: string
 *                 example: 'Australia'
 *     responses:
 *       200:
 *         description: User data synchronized successfully
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request - incomplete user data
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
router.post('/sync', AuthController.syncUserData);

/**
 * @swagger
 * /api/auth/verify/{userId}:
 *   get:
 *     summary: Verify user session
 *     description: Verifies if a user's session is valid
 *     tags:
 *       - Auth
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID to verify
 *     responses:
 *       200:
 *         description: Session verified successfully
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
 *                     isValid:
 *                       type: boolean
 *                       example: true
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request - missing userId
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
router.get('/verify/:userId', AuthController.verifySession);

export default router;