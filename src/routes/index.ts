// src/routes/index.ts
import { Router } from 'express';
import { logger } from '../config/logger';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
// Import other routes as needed

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

// API version and status endpoint
router.get('/', (_req, res) => {
  res.json({
    status: 'success',
    message: 'API is running',
    version: '1.0.0',
    timestamp: new Date()
  });
});

export default router;