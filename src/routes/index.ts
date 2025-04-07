// src/routes/index.ts
import { Router } from 'express';
import { logger } from '../config/logger';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import courseRoutes from './course.routes';
import userSaveRoutes from './user-save.routes'; 
import projectRoutes from './project.routes';

// Create main router
const router = Router();

// Log all API requests
router.use((req, _res, next) => {
  logger.debug(`API Request: [${req.method}] ${req.originalUrl}`);
  next();
});

// Register route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/courses', courseRoutes);
router.use('/projects', projectRoutes);
router.use('/', userSaveRoutes); 

/**
 * @swagger
 * /api:
 *   get:
 *     summary: API status endpoint
 *     description: Returns the API status, version, and current timestamp
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: API status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: 'success'
 *                 message:
 *                   type: string
 *                   example: 'API is running'
 *                 version:
 *                   type: string
 *                   example: '1.0.0'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/', (_req, res) => {
  res.json({
    status: 'success',
    message: 'API is running',
    version: '1.0.0',
    timestamp: new Date()
  });
});

export default router;