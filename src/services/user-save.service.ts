// src/services/user-save.service.ts
import mongoose from 'mongoose';
import { User, IUser, ISavedItem } from '../models/user.model';
import { Course } from '../models/course.model';
import { Project } from '../models/project.model';
import { createLogger } from '../config/logger';
import { EventPublisher } from './event.publisher';
import { EventType } from '../models/events.model';

const logger = createLogger('UserSaveService');

/**
 * Interface for saved item data with expanded details
 */
export interface ISavedItemWithDetails extends ISavedItem {
  details?: any; // Course or Project details
}

/**
 * Service for managing user saved/watched items
 */
export class UserSaveService {
  private static eventPublisher = EventPublisher.getInstance();

  /**
   * Save an item (course or project) for a user
   * @param userId The userId of the user
   * @param itemId The MongoDB ID of the item to save
   * @param itemType The type of the item ('course' or 'project')
   * @param notes Optional notes about why the user saved this item
   * @returns The saved item
   */
  static async saveItem(
    userId: string,
    itemId: string,
    itemType: 'course' | 'project',
    notes?: string
  ): Promise<ISavedItem> {
    try {
      // Validate that the itemId exists
      if (!mongoose.isValidObjectId(itemId)) {
        throw new Error('Invalid item ID format');
      }

      // Check if the item exists in the respective collection
      let itemExists = false;
      if (itemType === 'course') {
        itemExists = !!(await Course.findById(itemId));
      } else if (itemType === 'project') {
        itemExists = !!(await Project.findById(itemId));
      }

      if (!itemExists) {
        throw new Error(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} with ID ${itemId} not found`);
      }

      // Find the user
      const user = await User.findOne({ userId });
      
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Add to savedItems using the instance method
      const savedItem = await user.saveItem(itemId, itemType, notes);

      // Publish an event for analytics
      try {
        await this.eventPublisher.publishUserEvent(
          EventType.USER_UPDATED,
          {
            userId: user.userId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            userType: user.userType,
            country: user.country,
            organisation: user.organisation,
            fieldOfExpertise: user.fieldOfExpertise
          }
        );
      } catch (eventError) {
        logger.warn(`Failed to publish event for saved item: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
        // Continue even if event publishing fails
      }

      return savedItem;
    } catch (error) {
      logger.error(`Error saving ${itemType} for user: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Remove a saved item for a user
   * @param userId The userId of the user
   * @param itemId The MongoDB ID of the item to unsave
   * @param itemType The type of the item ('course' or 'project')
   * @returns Boolean indicating success
   */
  static async unsaveItem(
    userId: string,
    itemId: string,
    itemType: 'course' | 'project'
  ): Promise<boolean> {
    try {
      if (!mongoose.isValidObjectId(itemId)) {
        throw new Error('Invalid item ID format');
      }

      // Find the user
      const user = await User.findOne({ userId });
      
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Remove from savedItems using the instance method
      const result = await user.unsaveItem(itemId, itemType);

      return result;
    } catch (error) {
      logger.error(`Error unsaving ${itemType} for user: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

/**
 * Get all saved items for a user
 * @param userId The userId of the user
 * @param itemType Optional filter by item type
 * @returns Array of saved items
 */
static async getSavedItems(
    userId: string,
    itemType?: 'course' | 'project'
  ): Promise<ISavedItemWithDetails[]> {
    try {
      // Find the user and explicitly convert to a plain JavaScript object
      const user = await User.findOne({ userId }).lean();
      
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }
  
      // Since we used .lean(), we now have plain objects, not Mongoose documents
      // We need to properly type them and ensure they exist
      const savedItems = (user.savedItems || []) as unknown as ISavedItem[];
      
      // Filter by itemType if provided
      const filteredItems = itemType 
        ? savedItems.filter(item => item.itemType === itemType)
        : savedItems;
  
      // Sort by most recently saved
      const sortedItems = [...filteredItems].sort((a, b) => 
        new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      );
  
      // Enhance saved items with details
      const result: ISavedItemWithDetails[] = [];
      
      for (const item of sortedItems) {
        // Create a new object that conforms to our interface
        const enhancedItem: ISavedItemWithDetails = {
          itemId: item.itemId,
          itemType: item.itemType,
          savedAt: item.savedAt,
          notes: item.notes,
          details: null
        };
  
        // Fetch details based on item type
        try {
          if (item.itemType === 'course') {
            const course = await Course.findById(item.itemId).lean();
            if (course) {
              enhancedItem.details = {
                name: course.name,
                code: course.code,
                level: course.level,
                startDate: course.startDate,
                endDate: course.endDate,
                country: course.country,
                organisation: course.organisation
              };
            }
          } else if (item.itemType === 'project') {
            const project = await Project.findById(item.itemId).lean();
            if (project) {
              enhancedItem.details = {
                title: project.name,
                studentLevel: project.studentLevel,
                startDate: project.startDate,
                endDate: project.endDate,
                country: project.country,
                organisation: project.organisation
              };
            }
          }
        } catch (fetchError) {
          logger.warn(`Failed to fetch details for ${item.itemType} ${item.itemId}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
          // Continue even if we can't fetch details for one item
        }
  
        result.push(enhancedItem);
      }
  
      return result;
    } catch (error) {
      logger.error(`Error getting saved items for user: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Check if an item is saved by a user
   * @param userId The userId of the user
   * @param itemId The MongoDB ID of the item
   * @param itemType The type of the item ('course' or 'project')
   * @returns Boolean indicating if the item is saved
   */
  static async isItemSaved(
    userId: string,
    itemId: string,
    itemType: 'course' | 'project'
  ): Promise<boolean> {
    try {
      if (!mongoose.isValidObjectId(itemId)) {
        throw new Error('Invalid item ID format');
      }

      // Find the user
      const user = await User.findOne({ userId });
      
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Use the instance method to check
      return user.isSaved(itemId, itemType);
    } catch (error) {
      logger.error(`Error checking if item is saved: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get users who have saved a specific item
   * @param itemId The MongoDB ID of the item
   * @param itemType The type of the item ('course' or 'project')
   * @returns Array of users who have saved this item
   */
  static async getUsersWhoSavedItem(
    itemId: string,
    itemType: 'course' | 'project'
  ): Promise<IUser[]> {
    try {
      if (!mongoose.isValidObjectId(itemId)) {
        throw new Error('Invalid item ID format');
      }

      // Find users with this item in their savedItems
      const users = await User.find({
        'savedItems.itemId': new mongoose.Types.ObjectId(itemId),
        'savedItems.itemType': itemType
      });

      return users;
    } catch (error) {
      logger.error(`Error getting users who saved item: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get the count of saves for an item
   * @param itemId The MongoDB ID of the item
   * @param itemType The type of the item ('course' or 'project')
   * @returns Number of users who have saved this item
   */
  static async getSaveCount(
    itemId: string,
    itemType: 'course' | 'project'
  ): Promise<number> {
    try {
      if (!mongoose.isValidObjectId(itemId)) {
        throw new Error('Invalid item ID format');
      }

      // Count users with this item in their savedItems
      const count = await User.countDocuments({
        'savedItems.itemId': new mongoose.Types.ObjectId(itemId),
        'savedItems.itemType': itemType
      });

      return count;
    } catch (error) {
      logger.error(`Error getting save count: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get the most saved items of a specific type
   * @param itemType The type of items to get ('course' or 'project')
   * @param limit Maximum number of items to return
   * @returns Array of items with their save counts
   */
  static async getMostSavedItems(
    itemType: 'course' | 'project',
    limit: number = 10
  ): Promise<{ itemId: string; count: number; details?: any }[]> {
    try {
      // Aggregate to get the most saved items
      const result = await User.aggregate([
        // Unwind savedItems array to work with individual items
        { $unwind: '$savedItems' },
        // Filter by item type
        { $match: { 'savedItems.itemType': itemType } },
        // Group by itemId and count
        {
          $group: {
            _id: '$savedItems.itemId',
            count: { $sum: 1 }
          }
        },
        // Sort by count descending
        { $sort: { count: -1 } },
        // Limit results
        { $limit: limit },
        // Project final shape
        {
          $project: {
            _id: 0,
            itemId: { $toString: '$_id' },
            count: 1
          }
        }
      ]);

      // Enhance with item details
      for (const item of result) {
        try {
          if (itemType === 'course') {
            const course = await Course.findById(item.itemId);
            if (course) {
              item.details = {
                name: course.name,
                code: course.code,
                level: course.level,
                country: course.country,
                organisation: course.organisation
              };
            }
          } else if (itemType === 'project') {
            const project = await Project.findById(item.itemId);
            if (project) {
              item.details = {
                title: project.name,
                studentLevel: project.studentLevel,
                country: project.country,
                organisation: project.organisation
              };
            }
          }
        } catch (fetchError) {
          logger.warn(`Failed to fetch details for ${itemType} ${item.itemId}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
          // Continue even if we can't fetch details for one item
        }
      }

      return result;
    } catch (error) {
      logger.error(`Error getting most saved items: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}