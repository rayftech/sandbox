import { Router } from 'express';
// import userRoutes from './user.routes';
import { logger } from '../config/logger';

// Create main router
const router = Router();

// Log all API requests
router.use((req, res, next) => {
  logger.debug(`API Request: [${req.method}] ${req.originalUrl}`);
  next();
});

// // Register route modules
// router.use('/users', userRoutes);

// API version and status endpoint
router.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'API is running',
    version: '1.0.0',
    timestamp: new Date()
  });
});

export default router;