// src/routes/auth.routes.ts
import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();

// User synchronization endpoint
router.post('/sync', AuthController.syncUserData);

// Session verification endpoint
router.get('/verify/:userId', AuthController.verifySession);

export default router;