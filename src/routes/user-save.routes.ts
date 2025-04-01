// src/routes/user-save.routes.ts
import { Router } from 'express';
import { UserSaveController } from '../controllers/user-save.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(AuthMiddleware.authenticateUser);

/**
 * @swagger
 * /api/users/{userId}/saved-items:
 *   get:
 *     summary: Get all saved items for a user
 *     description: Retrieve all items that a user has saved/watched
 *     tags:
 *       - Users
 *       - Saved Items
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *       - in: query
 *         name: itemType
 *         schema:
 *           type: string
 *           enum: [course, project]
 *         description: Filter by item type
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: List of saved items retrieved successfully
 *       400:
 *         description: Bad request - invalid parameters
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - you can only view your own saved items
 *       500:
 *         description: Internal server error
 */
router.get('/:userId/saved-items', UserSaveController.getSavedItems);

/**
 * @swagger
 * /api/users/{userId}/saved-items:
 *   post:
 *     summary: Save an item for a user
 *     description: Save a course or project for a user
 *     tags:
 *       - Users
 *       - Saved Items
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *               - itemType
 *             properties:
 *               itemId:
 *                 type: string
 *                 description: MongoDB ID of the item to save
 *               itemType:
 *                 type: string
 *                 enum: [course, project]
 *                 description: Type of the item
 *               notes:
 *                 type: string
 *                 description: Optional notes about the saved item
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: Item saved successfully
 *       400:
 *         description: Bad request - invalid parameters
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - you can only save items to your own account
 *       500:
 *         description: Internal server error
 */
router.post('/:userId/saved-items', UserSaveController.saveItem);

/**
 * @swagger
 * /api/users/{userId}/saved-items:
 *   delete:
 *     summary: Unsave an item for a user
 *     description: Remove a course or project from a user's saved items
 *     tags:
 *       - Users
 *       - Saved Items
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *               - itemType
 *             properties:
 *               itemId:
 *                 type: string
 *                 description: MongoDB ID of the item to unsave
 *               itemType:
 *                 type: string
 *                 enum: [course, project]
 *                 description: Type of the item
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: Item unsaved successfully
 *       400:
 *         description: Bad request - invalid parameters
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - you can only unsave items from your own account
 *       404:
 *         description: Not found - item not in user's saved items
 *       500:
 *         description: Internal server error
 */
router.delete('/:userId/saved-items', UserSaveController.unsaveItem);

/**
 * @swagger
 * /api/users/{userId}/is-saved:
 *   get:
 *     summary: Check if an item is saved by a user
 *     description: Check if a specific course or project is in a user's saved items
 *     tags:
 *       - Users
 *       - Saved Items
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *       - in: query
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the item to check
 *       - in: query
 *         name: itemType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [course, project]
 *         description: Type of the item
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: Check completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     isSaved:
 *                       type: boolean
 *       400:
 *         description: Bad request - invalid parameters
 *       401:
 *         description: Unauthorized - authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/:userId/is-saved', UserSaveController.isItemSaved);

/**
 * @swagger
 * /api/items/{itemId}/save-count:
 *   get:
 *     summary: Get save count for an item
 *     description: Get the number of users who have saved a specific item
 *     tags:
 *       - Items
 *       - Saved Items
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the item
 *       - in: query
 *         name: itemType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [course, project]
 *         description: Type of the item
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: Save count retrieved successfully
 *       400:
 *         description: Bad request - invalid parameters
 *       401:
 *         description: Unauthorized - authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/items/:itemId/save-count', UserSaveController.getSaveCount);

/**
 * @swagger
 * /api/items/{itemId}/saved-by:
 *   get:
 *     summary: Get users who saved an item
 *     description: Get a list of users who have saved a specific item (admin only)
 *     tags:
 *       - Items
 *       - Saved Items
 *       - Admin
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ID of the item
 *       - in: query
 *         name: itemType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [course, project]
 *         description: Type of the item
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: User list retrieved successfully
 *       400:
 *         description: Bad request - invalid parameters
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - admin access required
 *       500:
 *         description: Internal server error
 */
router.get('/items/:itemId/saved-by', UserSaveController.getUsersWhoSavedItem);

/**
 * @swagger
 * /api/popular/{itemType}:
 *   get:
 *     summary: Get most saved items
 *     description: Get a list of the most saved items of a specific type
 *     tags:
 *       - Items
 *       - Saved Items
 *     parameters:
 *       - in: path
 *         name: itemType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [course, project]
 *         description: Type of the items to retrieve
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Maximum number of items to return
 *     security:
 *       - UserAuth: []
 *     responses:
 *       200:
 *         description: Popular items retrieved successfully
 *       400:
 *         description: Bad request - invalid parameters
 *       401:
 *         description: Unauthorized - authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/popular/:itemType', UserSaveController.getMostSavedItems);

export default router;