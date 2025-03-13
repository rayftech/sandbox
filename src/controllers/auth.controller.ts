// src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { UserService } from '../services/user.service';
import { createLogger } from '../config/logger';
import { EventPublisher } from '../services/event.publisher';
import { EventType } from '../models/events.model';

const logger = createLogger('AuthController');

export class AuthController {
  /**
   * Synchronize user data from Amplify
   * This endpoint handles user data coming from Amplify after login/registration
   */
  public static syncUserData = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userData = req.body;
    
    // Validate required fields
    if (!userData.userId || !userData.email) {
      logger.warn('Incomplete user data received for synchronization');
      return res.status(400).json({ 
        status: 'error', 
        message: 'Incomplete user data. userId and email are required.' 
      });
    }
    
    try {
      // Create or update user in the database
      const user = await UserService.createOrUpdateUser(userData);
      
      // Publish user event
      const isNewUser = user.createdAt === user.updatedAt;
      const eventType = isNewUser ? EventType.USER_CREATED : EventType.USER_UPDATED;
      
      await EventPublisher.getInstance().publishUserEvent(eventType, {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        country: user.country
      });
      
      logger.info(`User ${user.userId} successfully synchronized`);
      
      return res.status(200).json({
        status: 'success',
        data: {
          user: {
            userId: user.userId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            userType: user.userType,
            isAdmin: user.isAdmin
          }
        }
      });
    } catch (error) {
      logger.error(`Error synchronizing user data: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
  
  /**
   * Verify a user's session
   * This can be used to check if a user's token is still valid
   */
  public static verifySession = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'UserId is required'
      });
    }
    
    try {
      const user = await UserService.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }
      
      return res.status(200).json({
        status: 'success',
        data: {
          isValid: true,
          user: {
            userId: user.userId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            userType: user.userType,
            isAdmin: user.isAdmin
          }
        }
      });
    } catch (error) {
      logger.error(`Error verifying user session: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
}