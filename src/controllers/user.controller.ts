// src/controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { UserService } from '../services/user.service';
import { createLogger } from '../config/logger';
import { EventPublisher } from '../services/event.publisher';
import { EventType } from '../models/events.model';

const logger = createLogger('UserController');




export class UserController {
  /**
   * Get user profile by ID
   */
  public static getUserProfile = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }
    
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
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        profileSettings: user.profileSettings,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        totalCoursesCreated: user.totalCoursesCreated,
        totalProjectsCreated: user.totalProjectsCreated,
        totalPartnershipsInitiated: user.totalPartnershipsInitiated,
        totalPartnershipsReceived: user.totalPartnershipsReceived,
        successRate: user.successRate
      }
    });
  });

  
  
  /**
   * Update user profile settings
   */
  public static updateProfileSettings = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const { profileSettings } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }
    
    if (!profileSettings) {
      return res.status(400).json({
        status: 'error',
        message: 'Profile settings are required'
      });
    }
    
    try {
      const updatedUser = await UserService.updateProfileSettings(userId, profileSettings);
      
      if (!updatedUser) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }
      
      // Publish user updated event
      await EventPublisher.getInstance().publishUserEvent(
        EventType.USER_UPDATED,
        {
          userId: updatedUser.userId,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          userType: updatedUser.userType
        }
      );
      
      return res.status(200).json({
        status: 'success',
        data: {
          userId: updatedUser.userId,
          profileSettings: updatedUser.profileSettings
        }
      });
    } catch (error) {
      logger.error(`Error updating profile settings: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
  
  /**
   * Record user login
   */
  public static recordLogin = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }
    
    try {
      const user = await UserService.updateLastLogin(userId);
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }
      
      return res.status(200).json({
        status: 'success',
        data: {
          userId: user.userId,
          lastLogin: user.lastLogin
        }
      });
    } catch (error) {
      logger.error(`Error recording login: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
}