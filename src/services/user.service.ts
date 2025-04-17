// src/services/user.service.ts
import { User, IUser, IAmplifyUserData } from '../models/user.model';
import { createLogger } from '../config/logger';

const logger = createLogger('UserService');

/**
 * User service class for managing user operations
 * Implements core business logic that goes beyond basic CRUD operations
 */
export class UserService {
  /**
   * Create or update a user based on Amplify authentication data
   * @param userData The user data received from Amplify
   * @returns The saved user document
   */
  static async createOrUpdateUser(userData: IAmplifyUserData): Promise<IUser> {
    try {
      // Try to find the user by userId
      let user = await User.findOne({ userId: userData.userId });
      
      if (user) {
        // Update existing user with new Amplify data
        user.email = userData.email;
        user.firstName = userData.firstName;
        user.lastName = userData.lastName;
        user.userType = userData.userType;
        user.isAdmin = userData.isAdmin;
        
        // Update prefix if provided
        if (userData.prefix !== undefined) {
          user.prefix = userData.prefix;
        }
        
        // Update additional fields if provided
        if (userData.country) {
          user.country = userData.country;
        }
        
        if (userData.organisation) {
          user.organisation = userData.organisation;
        }
        
        if (userData.fieldOfExpertise) {
          // Handle fieldOfExpertise conversion from string to array
          if (typeof userData.fieldOfExpertise === 'string') {
            user.fieldOfExpertise = userData.fieldOfExpertise
              .split(',')
              .map(item => item.trim())
              .filter(item => item.length > 0);
          } else {
            user.fieldOfExpertise = userData.fieldOfExpertise;
          }
        }
        
        logger.info(`User updated: ${userData.userId}`);
        return await user.save();
      } else {
        // Create a new user with all available data
        // Process fieldOfExpertise before creating user
        let userData_processed = { ...userData };
        
        // Handle fieldOfExpertise conversion from string to array if needed
        if (userData.fieldOfExpertise && typeof userData.fieldOfExpertise === 'string') {
          userData_processed.fieldOfExpertise = userData.fieldOfExpertise
            .split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0);
        }
        
        user = new User(userData_processed);
        
        logger.info(`New user created: ${userData.userId}`);
        return await user.save();
      }
    } catch (error) {
      logger.error(`Error creating/updating user: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get a user by userId
   * @param userId The userId to find
   * @returns The user document or null if not found
   */
  static async getUserById(userId: string): Promise<IUser | null> {
    try {
      return await User.findOne({ userId });
    } catch (error) {
      logger.error(`Error finding user: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get users by type
   * @param userType The type of users to find
   * @returns Array of matching user documents
   */
  static async getUsersByType(userType: string): Promise<IUser[]> {
    try {
      return await User.find({ userType });
    } catch (error) {
      logger.error(`Error finding users by type: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update user profile settings
   * @param userId The userId of the user
   * @param profileSettings The profile settings to update
   * @returns The updated user document or null if not found
   */
  static async updateProfileSettings(userId: string, profileSettings: any): Promise<IUser | null> {
    try {
      const updateData: any = {};
      
      // Validate visibility setting
      if (profileSettings.visibility) {
        if (!['public', 'private', 'friends-only'].includes(profileSettings.visibility)) {
          throw new Error('Invalid visibility setting. Must be "public", "private", or "friends-only"');
        }
        updateData['profileSettings.visibility'] = profileSettings.visibility;
      }
      
      // Validate boolean settings
      if (typeof profileSettings.allowFriendRequests === 'boolean') {
        updateData['profileSettings.allowFriendRequests'] = profileSettings.allowFriendRequests;
      }
      
      if (typeof profileSettings.emailNotifications === 'boolean') {
        updateData['profileSettings.emailNotifications'] = profileSettings.emailNotifications;
      }
      
      // Update user
      const user = await User.findOneAndUpdate(
        { userId },
        { $set: updateData },
        { new: true }
      );
      
      if (user) {
        logger.info(`Updated profile settings for user ${userId}`);
      } else {
        logger.warn(`Attempted to update profile settings for non-existent user ${userId}`);
      }
      
      return user;
    } catch (error) {
      logger.error(`Error updating profile settings: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update user organisation
   * @param userId The userId of the user
   * @param organisation The organisation to update
   * @returns The updated user document or null if not found
   */
  static async updateOrganisation(userId: string, organisation: string): Promise<IUser | null> {
    try {
      const user = await User.findOneAndUpdate(
        { userId },
        { $set: { organisation } },
        { 
          new: true,  // Return the updated document
          runValidators: true // Run mongoose validation
        }
      );
      
      if (user) {
        logger.info(`Updated organisation for user ${userId}`);
      } else {
        logger.warn(`Attempted to update organisation for non-existent user ${userId}`);
      }
      
      return user;
    } catch (error) {
      logger.error(`Error updating organisation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update user country
   * @param userId The userId of the user
   * @param country The country to update
   * @returns The updated user document or null if not found
   */
  static async updateCountry(userId: string, country: string): Promise<IUser | null> {
    try {
      const user = await User.findOneAndUpdate(
        { userId },
        { $set: { country } },
        { 
          new: true,  // Return the updated document
          runValidators: true // Run mongoose validation
        }
      );
      
      if (user) {
        logger.info(`Updated country for user ${userId}`);
      } else {
        logger.warn(`Attempted to update country for non-existent user ${userId}`);
      }
      
      return user;
    } catch (error) {
      logger.error(`Error updating country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update user's field of expertise
   * @param userId The userId of the user
   * @param fieldOfExpertise The field of expertise to update (string or array)
   * @returns The updated user document or null if not found
   */
  static async updateFieldOfExpertise(userId: string, fieldOfExpertise: string | string[]): Promise<IUser | null> {
    try {
      // Convert string to array if needed
      let expertiseArray: string[];
      
      if (typeof fieldOfExpertise === 'string') {
        // Split by comma and trim whitespace
        expertiseArray = fieldOfExpertise
          .split(',')
          .map(item => item.trim())
          .filter(item => item.length > 0); // Remove empty items
      } else {
        expertiseArray = fieldOfExpertise;
      }
      
      const user = await User.findOneAndUpdate(
        { userId },
        { $set: { fieldOfExpertise: expertiseArray } },
        { 
          new: true,  // Return the updated document
          runValidators: true // Run mongoose validation
        }
      );
      
      if (user) {
        logger.info(`Updated field of expertise for user ${userId}: ${expertiseArray.join(', ')}`);
      } else {
        logger.warn(`Attempted to update field of expertise for non-existent user ${userId}`);
      }
      
      return user;
    } catch (error) {
      logger.error(`Error updating field of expertise: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update user's last login timestamp
   * @param userId The userId of the user
   * @returns The updated user document or null if not found
   */
  static async updateLastLogin(userId: string): Promise<IUser | null> {
    try {
      const user = await User.findOneAndUpdate(
        { userId },
        { $set: { lastLogin: new Date() } },
        { new: true }
      );
      
      if (user) {
        logger.info(`Updated last login for user ${userId}`);
      } else {
        logger.warn(`Attempted to update last login for non-existent user ${userId}`);
      }
      
      return user;
    } catch (error) {
      logger.error(`Error updating last login: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get users by country
   * @param country The country to filter by
   * @returns Array of matching user documents
   */
  static async getUsersByCountry(country: string): Promise<IUser[]> {
    try {
      return await User.find({ country }).sort({ lastName: 1, firstName: 1 });
    } catch (error) {
      logger.error(`Error getting users by country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get users by organisation
   * @param organisation The organisation to filter by
   * @returns Array of matching user documents
   */
  static async getUsersByOrganisation(organisation: string): Promise<IUser[]> {
    try {
      return await User.find({ organisation }).sort({ lastName: 1, firstName: 1 });
    } catch (error) {
      logger.error(`Error getting users by organisation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Search users by name or email
   * @param query The search query string
   * @param limit Maximum number of results to return
   * @returns Array of matching user documents
   */
  static async searchUsers(query: string, limit: number = 10): Promise<IUser[]> {
    try {
      // Create text index if it doesn't exist yet
      const collection = User.collection;
      const indexes = await collection.indexes();
      
      const hasTextIndex = indexes.some(index => 
        index.name === 'firstName_text_lastName_text_email_text_organisation_text'
      );
      
      if (!hasTextIndex) {
        await collection.createIndex({ 
          firstName: 'text',
          lastName: 'text',
          email: 'text',
          organisation: 'text'
        });
      }
      
      // Perform text search
      return await User.find(
        { $text: { $search: query } },
        { score: { $meta: 'textScore' } }
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit);
    } catch (error) {
      logger.error(`Error searching users: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get users with pagination
   * @param page The page number (1-based)
   * @param limit The number of items per page
   * @param filters Additional filters to apply
   * @returns Object containing paginated results and metadata
   */
  static async getPaginatedUsers(
    page: number = 1,
    limit: number = 10,
    filters: any = {}
  ): Promise<{ users: IUser[], total: number, pages: number }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;

      // Count total matching documents for pagination metadata
      const total = await User.countDocuments(filters);
      
      // Get the paginated results
      const users = await User.find(filters)
        .sort({ lastName: 1, firstName: 1 })
        .skip(skip)
        .limit(validLimit);

      // Calculate total pages
      const pages = Math.ceil(total / validLimit);

      return {
        users,
        total,
        pages
      };
    } catch (error) {
      logger.error(`Error getting paginated users: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}