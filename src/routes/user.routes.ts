// src/routes/user.routes.ts
import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Apply authentication middleware to all user routes
router.use(AuthMiddleware.authenticateUser);

// Get user profile
router.get('/:userId/profile', UserController.getUserProfile);

// Update profile settings
router.patch('/:userId/profile-settings', UserController.updateProfileSettings);

// Record login
router.post('/:userId/record-login', UserController.recordLogin);

// Admin-only routes
router.get(
  '/admin/all-users',
  AuthMiddleware.requireAdmin,
  (req, res) => {
    // Admin-only endpoint to get all users
    // To be implemented
    res.status(501).json({ message: 'Not implemented yet' });
  }
);

export default router;