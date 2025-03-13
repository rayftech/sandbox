// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { createLogger } from '../config/logger';
import { ApiError } from './error.middleware';

const logger = createLogger('AuthMiddleware');

// Extend the Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export class AuthMiddleware {
  /**
   * Middleware to verify if request contains valid user data
   * This assumes the request has a userId in headers, params, or body
   */
  public static authenticateUser = async (
    req: Request, 
    _res: Response, // Use underscore prefix to indicate intentionally unused
    next: NextFunction
  ) => {
    try {
      // Extract userId from request (check headers, params, and body)
      const userId = 
        req.headers['x-user-id'] as string || 
        req.params.userId || 
        (req.body && req.body.userId);
      
      if (!userId) {
        logger.warn('Authentication failed: No userId provided');
        return next(new ApiError(401, 'Authentication required. Please login.'));
      }
      
      // Fetch user from database
      const user = await UserService.getUserById(userId);
      
      if (!user) {
        logger.warn(`Authentication failed: User with ID ${userId} not found`);
        return next(new ApiError(401, 'Invalid user authentication.'));
      }
      
      // Attach user to request object for use in downstream handlers
      req.user = user;
      next();
    } catch (error) {
      logger.error(`Authentication error: ${error instanceof Error ? error.message : String(error)}`);
      next(new ApiError(500, 'Authentication error occurred'));
    }
  };
  
  /**
   * Middleware to verify if user is an admin
   * Must be used after authenticateUser middleware
   */
  public static requireAdmin = (
    req: Request, 
    _res: Response, // Use underscore prefix to indicate intentionally unused
    next: NextFunction
  ) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    
    if (!req.user.isAdmin) {
      logger.warn(`Admin access denied for user ${req.user.userId}`);
      return next(new ApiError(403, 'Admin access required'));
    }
    
    next();
  };
  
  /**
   * Middleware to verify if user is of a specific type
   * Must be used after authenticateUser middleware
   */
  public static requireUserType = (allowedTypes: string[]) => {
    return (
      req: Request, 
      _res: Response, // Use underscore prefix to indicate intentionally unused
      next: NextFunction
    ) => {
      if (!req.user) {
        return next(new ApiError(401, 'Authentication required'));
      }
      
      if (!allowedTypes.includes(req.user.userType)) {
        logger.warn(`Access denied for user ${req.user.userId} with type ${req.user.userType}`);
        return next(new ApiError(403, `Access restricted to ${allowedTypes.join(', ')} users`));
      }
      
      next();
    };
  };
}