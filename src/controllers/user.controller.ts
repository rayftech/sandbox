// src/controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { UserService } from '../services/user.service';
import { createLogger } from '../config/logger';
import { EventPublisher } from '../services/event.publisher';
import { EventType } from '../models/events.model';
// import { ApiError } from '../middlewares/error.middleware';

const logger = createLogger('UserController');

export class UserController {
  /**
   * Format fieldOfExpertise for event publishing
   * Ensures fieldOfExpertise is consistently handled when publishing events
   */
  private static formatFieldOfExpertise(fieldOfExpertise: string[] | string | undefined): string | undefined {
    if (!fieldOfExpertise) return undefined;
    
    if (Array.isArray(fieldOfExpertise)) {
      return fieldOfExpertise.join(', ');
    }
    
    return fieldOfExpertise;
  }
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
        prefix: user.prefix,
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
        successRate: user.successRate,
        country: user.country,
        organisation: user.organisation,
        fieldOfExpertise: Array.isArray(user.fieldOfExpertise) ? user.fieldOfExpertise : []
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
          userType: updatedUser.userType,
          country: updatedUser.country,
          organisation: updatedUser.organisation,
          fieldOfExpertise: UserController.formatFieldOfExpertise(updatedUser.fieldOfExpertise)
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
   * Update user organisation
   */
  public static updateOrganisation = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const { organisation } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }
    
    if (!organisation) {
      return res.status(400).json({
        status: 'error',
        message: 'Organisation is required'
      });
    }
    
    try {
      const updatedUser = await UserService.updateOrganisation(userId, organisation);
      
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
          userType: updatedUser.userType,
          country: updatedUser.country,
          organisation: updatedUser.organisation,
          fieldOfExpertise: UserController.formatFieldOfExpertise(updatedUser.fieldOfExpertise)
        }
      );
      
      return res.status(200).json({
        status: 'success',
        data: {
          userId: updatedUser.userId,
          organisation: updatedUser.organisation
        }
      });
    } catch (error) {
      logger.error(`Error updating organisation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Update user country
   */
  public static updateCountry = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const { country } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }
    
    if (!country) {
      return res.status(400).json({
        status: 'error',
        message: 'Country is required'
      });
    }
    
    try {
      const updatedUser = await UserService.updateCountry(userId, country);
      
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
          userType: updatedUser.userType,
          country: updatedUser.country,
          organisation: updatedUser.organisation,
          fieldOfExpertise: UserController.formatFieldOfExpertise(updatedUser.fieldOfExpertise)
        }
      );
      
      return res.status(200).json({
        status: 'success',
        data: {
          userId: updatedUser.userId,
          country: updatedUser.country
        }
      });
    } catch (error) {
      logger.error(`Error updating country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Update user's field of expertise
   */
  public static updateFieldOfExpertise = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const { fieldOfExpertise } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }
    
    if (!fieldOfExpertise) {
      return res.status(400).json({
        status: 'error',
        message: 'Field of expertise is required'
      });
    }
    
    try {
      const updatedUser = await UserService.updateFieldOfExpertise(userId, fieldOfExpertise);
      
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
          userType: updatedUser.userType,
          country: updatedUser.country,
          organisation: updatedUser.organisation,
          fieldOfExpertise: UserController.formatFieldOfExpertise(updatedUser.fieldOfExpertise)
        }
      );
      
      return res.status(200).json({
        status: 'success',
        data: {
          userId: updatedUser.userId,
          fieldOfExpertise: Array.isArray(updatedUser.fieldOfExpertise) 
            ? updatedUser.fieldOfExpertise 
            : []
        }
      });
    } catch (error) {
      logger.error(`Error updating field of expertise: ${error instanceof Error ? error.message : String(error)}`);
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

  /**
   * Search users
   */
  public static searchUsers = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { q, limit } = req.query;
    
    if (!q) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query is required'
      });
    }
    
    const limitNum = limit ? parseInt(limit as string, 10) : 10;
    const users = await UserService.searchUsers(q as string, limitNum);
    
    return res.status(200).json({
      status: 'success',
      data: {
        users: users.map(user => ({
          userId: user.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          country: user.country,
          organisation: user.organisation,
          fieldOfExpertise: Array.isArray(user.fieldOfExpertise) ? user.fieldOfExpertise : []
        }))
      }
    });
  });

  /**
   * Get users by country
   */
  public static getUsersByCountry = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { country } = req.params;
    
    if (!country) {
      return res.status(400).json({
        status: 'error',
        message: 'Country is required'
      });
    }
    
    const users = await UserService.getUsersByCountry(country);
    
    return res.status(200).json({
      status: 'success',
      data: {
        users: users.map(user => ({
          userId: user.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          organisation: user.organisation,
          fieldOfExpertise: Array.isArray(user.fieldOfExpertise) ? user.fieldOfExpertise : []
        }))
      }
    });
  });

  /**
   * Get users by organisation
   */
  public static getUsersByOrganisation = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { organisation } = req.params;
    
    if (!organisation) {
      return res.status(400).json({
        status: 'error',
        message: 'Organisation is required'
      });
    }
    
    const users = await UserService.getUsersByOrganisation(organisation);
    
    return res.status(200).json({
      status: 'success',
      data: {
        users: users.map(user => ({
          userId: user.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          country: user.country,
          fieldOfExpertise: Array.isArray(user.fieldOfExpertise) ? user.fieldOfExpertise : []
        }))
      }
    });
  });

  /**
   * Get paginated users with filters
   */
  public static getPaginatedUsers = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { page, limit, userType, country, organisation } = req.query;
    const filters: any = {};
    
    // Build filters based on query parameters
    if (userType) {
      filters.userType = userType;
    }
    
    if (country) {
      filters.country = country;
    }
    
    if (organisation) {
      filters.organisation = organisation;
    }
    
    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;
    
    const result = await UserService.getPaginatedUsers(pageNum, limitNum, filters);
    
    return res.status(200).json({
      status: 'success',
      data: {
        users: result.users.map(user => ({
          userId: user.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          country: user.country,
          organisation: user.organisation,
          fieldOfExpertise: Array.isArray(user.fieldOfExpertise) ? user.fieldOfExpertise : []
        })),
        pagination: {
          total: result.total,
          pages: result.pages,
          page: pageNum,
          limit: limitNum
        }
      }
    });
  });
}