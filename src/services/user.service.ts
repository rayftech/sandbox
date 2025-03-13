// src/services/user.service.ts
// import mongoose from 'mongoose';
import { User, IUser } from '../models/user.model';
import { createLogger } from '../config/logger';

const logger = createLogger('UserService');

// Type for Amplify user data
export interface IAmplifyUserData {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'academic' | 'industry' | 'admin';
  isAdmin: boolean;
}

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
        
        logger.info(`User updated: ${userData.userId}`);
        return await user.save();
      } else {
        // Create a new user
        user = new User({
          ...userData,
          // Additional default fields can be set here
        });
        
        logger.info(`New user created: ${userData.userId}`);
        return await user.save();
      }
    } catch (error) {
      logger.error(`Error creating/updating user: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  // Add your other service methods here...
  
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
}