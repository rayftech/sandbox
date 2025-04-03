// src/controllers/user-save.controller.ts
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { UserSaveService } from '../services/user-save.service';
// import { createLogger } from '../config/logger';
import { ApiError } from '../middlewares/error.middleware';

// const logger = createLogger('UserSaveController');

export class UserSaveController {
  /**
   * Save an item for a user
   */
  public static saveItem = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const { itemId, itemType, notes } = req.body;
    
    if (!userId) {
      throw new ApiError(400, 'User ID is required');
    }
    
    if (!itemId || !itemType) {
      throw new ApiError(400, 'Item ID and item type are required');
    }
    
    if (itemType !== 'course' && itemType !== 'project') {
      throw new ApiError(400, 'Item type must be either "course" or "project"');
    }
    
    // Check if the requesting user matches the userId in the route
    if (req.user.userId !== userId) {
      throw new ApiError(403, 'You can only save items to your own account');
    }
    
    const savedItem = await UserSaveService.saveItem(userId, itemId, itemType, notes);
    
    return res.status(200).json({
      status: 'success',
      data: {
        savedItem
      }
    });
  });


  /**
   * Unsave an item for a user
   */
  public static unsaveItem = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const { itemId, itemType } = req.body;
    
    if (!userId) {
      throw new ApiError(400, 'User ID is required');
    }
    
    if (!itemId || !itemType) {
      throw new ApiError(400, 'Item ID and item type are required');
    }
    
    if (itemType !== 'course' && itemType !== 'project') {
      throw new ApiError(400, 'Item type must be either "course" or "project"');
    }
    
    // Check if the requesting user matches the userId in the route
    if (req.user.userId !== userId) {
      throw new ApiError(403, 'You can only unsave items from your own account');
    }
    
    const result = await UserSaveService.unsaveItem(userId, itemId, itemType);
    
    if (!result) {
      return res.status(404).json({
        status: 'error',
        message: `Item not found in user's saved items`
      });
    }
    
    return res.status(200).json({
      status: 'success',
      message: 'Item unsaved successfully'
    });
  });

  /**
   * Get all saved items for a user
   */
  public static getSavedItems = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const { itemType } = req.query;
    
    if (!userId) {
      throw new ApiError(400, 'User ID is required');
    }
    
    // Type check itemType query parameter
    let typeFilter: 'course' | 'project' | undefined = undefined;
    if (itemType === 'course' || itemType === 'project') {
      typeFilter = itemType;
    } else if (itemType) {
      throw new ApiError(400, 'Item type must be either "course" or "project"');
    }
    
    // In a real-world scenario, we might want to add privacy checks here
    // For now, we'll allow users to see their own saved items and admins to see anyone's
    if (req.user.userId !== userId && !req.user.isAdmin) {
      throw new ApiError(403, 'You do not have permission to view these saved items');
    }
    
    const savedItems = await UserSaveService.getSavedItems(userId, typeFilter);
    
    return res.status(200).json({
      status: 'success',
      data: {
        savedItems,
        count: savedItems.length
      }
    });
  });

  /**
   * Check if an item is saved by a user
   */
  public static isItemSaved = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const { itemId, itemType } = req.query as { itemId: string; itemType: 'course' | 'project' };
    
    if (!userId) {
      throw new ApiError(400, 'User ID is required');
    }
    
    if (!itemId || !itemType) {
      throw new ApiError(400, 'Item ID and item type are required query parameters');
    }
    
    if (itemType !== 'course' && itemType !== 'project') {
      throw new ApiError(400, 'Item type must be either "course" or "project"');
    }
    
    const isSaved = await UserSaveService.isItemSaved(userId, itemId, itemType);
    
    return res.status(200).json({
      status: 'success',
      data: {
        isSaved
      }
    });
  });

  /**
   * Get save count for an item
   */
  public static getSaveCount = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { itemId } = req.params;
    const { itemType } = req.query as { itemType: 'course' | 'project' };
    
    if (!itemId) {
      throw new ApiError(400, 'Item ID is required');
    }
    
    if (!itemType) {
      throw new ApiError(400, 'Item type is required as a query parameter');
    }
    
    if (itemType !== 'course' && itemType !== 'project') {
      throw new ApiError(400, 'Item type must be either "course" or "project"');
    }
    
    const count = await UserSaveService.getSaveCount(itemId, itemType);
    
    return res.status(200).json({
      status: 'success',
      data: {
        itemId,
        itemType,
        count
      }
    });
  });

  /**
   * Get users who have saved a specific item
   */
  public static getUsersWhoSavedItem = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { itemId } = req.params;
    const { itemType } = req.query as { itemType: 'course' | 'project' };
    
    if (!itemId) {
      throw new ApiError(400, 'Item ID is required');
    }
    
    if (!itemType) {
      throw new ApiError(400, 'Item type is required as a query parameter');
    }
    
    if (itemType !== 'course' && itemType !== 'project') {
      throw new ApiError(400, 'Item type must be either "course" or "project"');
    }
    
    // Only admins should be able to access this endpoint
    if (!req.user.isAdmin) {
      throw new ApiError(403, 'Only administrators can access this information');
    }
    
    const users = await UserSaveService.getUsersWhoSavedItem(itemId, itemType);
    
    // Filter sensitive information before returning
    const filteredUsers = users.map(user => ({
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      userType: user.userType,
      country: user.country,
      organisation: user.organisation
    }));
    
    return res.status(200).json({
      status: 'success',
      data: {
        itemId,
        itemType,
        count: filteredUsers.length,
        users: filteredUsers
      }
    });
  });

  /**
   * Get most saved items of a specific type
   */
  public static getMostSavedItems = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { itemType } = req.params;
    const { limit } = req.query;
    
    if (itemType !== 'course' && itemType !== 'project') {
      throw new ApiError(400, 'Item type must be either "course" or "project"');
    }
    
    // Parse limit parameter
    const limitNum = limit ? parseInt(limit as string, 10) : 10;
    
    // Validate limit
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new ApiError(400, 'Limit must be a number between 1 and 100');
    }
    
    const items = await UserSaveService.getMostSavedItems(itemType as 'course' | 'project', limitNum);
    
    return res.status(200).json({
      status: 'success',
      data: {
        itemType,
        limit: limitNum,
        count: items.length,
        items
      }
    });
  });
}