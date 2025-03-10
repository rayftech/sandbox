// src/models/user.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';
import { createLogger } from '../config/logger';

const logger = createLogger('UserModel');

/**
 * Interface representing the core user data received from Amplify
 * This reflects the minimal data that will be stored in our database
 */
export interface IAmplifyUserData {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'academic' | 'industry' | 'admin';
  isAdmin: boolean;
}

/**
 * Interface for User attributes (without mongoose Document properties)
 */
export interface IUserAttributes extends IAmplifyUserData {
  following: string[]; // Array of userIds the user is following
  followers: string[]; // Array of userIds following this user
  friendRequests: {
    sent: string[]; // Array of userIds to whom friend requests were sent
    received: string[]; // Array of userIds from whom friend requests were received
    accepted: string[]; // Array of confirmed friend userIds
  };
  lastLogin: Date;
  profileSettings: {
    visibility: 'public' | 'private' | 'friends-only';
    allowFriendRequests: boolean;
    emailNotifications: boolean;
  };
  // Analytics fields for snowflake schema
  totalCoursesCreated?: number;
  totalProjectsCreated?: number;
  totalPartnershipsInitiated?: number;
  totalPartnershipsReceived?: number;
  successRate?: number;
}

/**
 * Interface for User document with methods
 */
interface IUserDocument extends Document, IUserAttributes {
  // Common fields added by Mongoose
  createdAt: Date;
  updatedAt: Date;
  
  // Define any methods here
}

/**
 * Interface for User model with static methods
 */
interface IUserModel extends Model<IUserDocument> {
  // Add any static methods here if needed
}

/**
 * User Schema for MongoDB (incorporating both social features and snowflake schema design)
 */
const UserSchema = new Schema<IUserDocument>(
  {
    // Core fields from Amplify
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      comment: 'Amplify userId as primary identifier'
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    userType: {
      type: String,
      enum: ['academic', 'industry', 'admin'],
      required: true,
      index: true,
    },
    isAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
    
    // Social features
    following: [{
      type: String,
      ref: 'User',
      index: true,
    }],
    followers: [{
      type: String,
      ref: 'User',
      index: true,
    }],
    friendRequests: {
      sent: [{
        type: String,
        ref: 'User',
      }],
      received: [{
        type: String,
        ref: 'User',
      }],
      accepted: [{
        type: String,
        ref: 'User',
        index: true,
      }],
    },
    
    // User preferences and activity tracking
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    profileSettings: {
      visibility: {
        type: String,
        enum: ['public', 'private', 'friends-only'],
        default: 'public',
      },
      allowFriendRequests: {
        type: Boolean,
        default: true,
      },
      emailNotifications: {
        type: Boolean,
        default: true,
      },
    },
    
    // Analytics aggregation fields (for snowflake schema)
    totalCoursesCreated: {
      type: Number,
      default: 0,
    },
    totalProjectsCreated: {
      type: Number,
      default: 0,
    },
    totalPartnershipsInitiated: {
      type: Number,
      default: 0,
    },
    totalPartnershipsReceived: {
      type: Number,
      default: 0,
    },
    successRate: {
      type: Number,
      min: 0,
      max: 100,
    }
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes for better query performance
UserSchema.index({ userType: 1, isAdmin: 1 });
UserSchema.index({ lastName: 1, firstName: 1 });
UserSchema.index({ 'friendRequests.accepted': 1 });
UserSchema.index({ 'friendRequests.sent': 1 });
UserSchema.index({ 'friendRequests.received': 1 });

// Create and export the model with proper type information
export const User = mongoose.model<IUserDocument, IUserModel>('User', UserSchema);

// Re-export the interface for use in other files
export type IUser = IUserDocument;

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
  static async createOrUpdateUser(userData: IAmplifyUserData): Promise<IUserDocument> {
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
        user.lastLogin = new Date();
        
        logger.info(`User updated: ${userData.userId}`);
        return await user.save();
      } else {
        // Create a new user
        user = new User({
          ...userData,
          lastLogin: new Date(),
          following: [],
          followers: [],
          friendRequests: {
            sent: [],
            received: [],
            accepted: [],
          },
          profileSettings: {
            visibility: 'public',
            allowFriendRequests: true,
            emailNotifications: true,
          },
        });
        
        logger.info(`New user created: ${userData.userId}`);
        return await user.save();
      }
    } catch (error) {
      logger.error(`Error creating/updating user: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Follow or watch another user
   * @param userId The userId of the user who wants to follow
   * @param targetUserId The userId of the user to be followed
   * @returns The updated user document
   */
  static async followUser(userId: string, targetUserId: string): Promise<IUserDocument> {
    try {
      // Validate that target user exists
      const targetUser = await User.findOne({ userId: targetUserId });
      if (!targetUser) {
        throw new Error(`Target user ${targetUserId} not found`);
      }
      
      // Update the follower's following list
      const user = await User.findOneAndUpdate(
        { userId: userId, following: { $ne: targetUserId } },
        { $addToSet: { following: targetUserId } },
        { new: true }
      );
      
      if (!user) {
        throw new Error(`User ${userId} not found or already following ${targetUserId}`);
      }
      
      // Update the target's followers list
      await User.findOneAndUpdate(
        { userId: targetUserId },
        { $addToSet: { followers: userId } }
      );
      
      logger.info(`User ${userId} is now following ${targetUserId}`);
      return user;
    } catch (error) {
      logger.error(`Error following user: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Unfollow another user
   * @param userId The userId of the user who wants to unfollow
   * @param targetUserId The userId of the user to be unfollowed
   * @returns The updated user document
   */
  static async unfollowUser(userId: string, targetUserId: string): Promise<IUserDocument> {
    try {
      // Update the follower's following list
      const user = await User.findOneAndUpdate(
        { userId: userId },
        { $pull: { following: targetUserId } },
        { new: true }
      );
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Update the target's followers list
      await User.findOneAndUpdate(
        { userId: targetUserId },
        { $pull: { followers: userId } }
      );
      
      logger.info(`User ${userId} has unfollowed ${targetUserId}`);
      return user;
    } catch (error) {
      logger.error(`Error unfollowing user: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Send a friend request to another user
   * @param userId The userId of the user sending the request
   * @param targetUserId The userId of the user receiving the request
   * @returns The updated user document
   */
  static async sendFriendRequest(userId: string, targetUserId: string): Promise<IUserDocument> {
    try {
      // Check if users are already friends
      const user = await User.findOne({ 
        userId: userId,
        'friendRequests.accepted': { $ne: targetUserId }
      });
      
      if (!user) {
        throw new Error(`User ${userId} not found or already friends with ${targetUserId}`);
      }
      
      // Check if target user exists and accepts friend requests
      const targetUser = await User.findOne({ 
        userId: targetUserId,
        'profileSettings.allowFriendRequests': true
      });
      
      if (!targetUser) {
        throw new Error(`Target user ${targetUserId} not found or does not accept friend requests`);
      }
      
      // Check if request is already sent
      if (user.friendRequests.sent.includes(targetUserId)) {
        throw new Error(`Friend request to ${targetUserId} already sent`);
      }
      
      // Check if there's a pending received request (auto-accept in this case)
      if (user.friendRequests.received.includes(targetUserId)) {
        return await UserService.acceptFriendRequest(userId, targetUserId);
      }
      
      // Update sender's sent requests
      await User.findOneAndUpdate(
        { userId: userId },
        { $addToSet: { 'friendRequests.sent': targetUserId } }
      );
      
      // Update receiver's received requests
      await User.findOneAndUpdate(
        { userId: targetUserId },
        { $addToSet: { 'friendRequests.received': userId } }
      );
      
      logger.info(`User ${userId} sent friend request to ${targetUserId}`);
      
      // Fetch and return the updated user document
      const updatedUser = await User.findOne({ userId });
      
      // Handle null case explicitly to satisfy TypeScript
      if (!updatedUser) {
        throw new Error(`Failed to retrieve updated user ${userId} after sending friend request`);
      }
      
      return updatedUser;
    } catch (error) {
      logger.error(`Error sending friend request: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Accept a friend request
   * @param userId The userId of the user accepting the request
   * @param requesterUserId The userId of the user who sent the request
   * @returns The updated user document
   */
  static async acceptFriendRequest(userId: string, requesterUserId: string): Promise<IUserDocument> {
    try {
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // Update the accepting user's document
        const user = await User.findOneAndUpdate(
          { 
            userId: userId,
            'friendRequests.received': requesterUserId,
            'friendRequests.accepted': { $ne: requesterUserId }
          },
          { 
            $pull: { 'friendRequests.received': requesterUserId },
            $addToSet: { 'friendRequests.accepted': requesterUserId } 
          },
          { new: true, session }
        );
        
        if (!user) {
          throw new Error(`User ${userId} not found or no request from ${requesterUserId} exists`);
        }
        
        // Update the requester's document
        const requester = await User.findOneAndUpdate(
          { 
            userId: requesterUserId,
            'friendRequests.sent': userId 
          },
          { 
            $pull: { 'friendRequests.sent': userId },
            $addToSet: { 'friendRequests.accepted': userId } 
          },
          { session }
        );
        
        if (!requester) {
          throw new Error(`Requester ${requesterUserId} not found or no request to ${userId} exists`);
        }
        
        // Also make them follow each other
        await User.findOneAndUpdate(
          { userId: userId },
          { $addToSet: { following: requesterUserId } },
          { session }
        );
        
        await User.findOneAndUpdate(
          { userId: requesterUserId },
          { $addToSet: { following: userId } },
          { session }
        );
        
        await session.commitTransaction();
        logger.info(`User ${userId} accepted friend request from ${requesterUserId}`);
        return user;
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      logger.error(`Error accepting friend request: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Reject a friend request
   * @param userId The userId of the user rejecting the request
   * @param requesterUserId The userId of the user who sent the request
   * @returns The updated user document
   */
  static async rejectFriendRequest(userId: string, requesterUserId: string): Promise<IUserDocument> {
    try {
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // Remove from received requests
        const user = await User.findOneAndUpdate(
          { userId: userId },
          { $pull: { 'friendRequests.received': requesterUserId } },
          { new: true, session }
        );
        
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }
        
        // Remove from sent requests
        await User.findOneAndUpdate(
          { userId: requesterUserId },
          { $pull: { 'friendRequests.sent': userId } },
          { session }
        );
        
        await session.commitTransaction();
        logger.info(`User ${userId} rejected friend request from ${requesterUserId}`);
        return user;
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      logger.error(`Error rejecting friend request: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Remove a friend
   * @param userId The userId of the user removing the friend
   * @param friendUserId The userId of the friend to be removed
   * @returns The updated user document
   */
  static async removeFriend(userId: string, friendUserId: string): Promise<IUserDocument> {
    try {
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // Remove from user's accepted friends
        const user = await User.findOneAndUpdate(
          { userId: userId },
          { $pull: { 'friendRequests.accepted': friendUserId } },
          { new: true, session }
        );
        
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }
        
        // Remove from friend's accepted friends
        await User.findOneAndUpdate(
          { userId: friendUserId },
          { $pull: { 'friendRequests.accepted': userId } },
          { session }
        );
        
        await session.commitTransaction();
        logger.info(`User ${userId} removed friend ${friendUserId}`);
        return user;
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      logger.error(`Error removing friend: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get a list of user's friends
   * @param userId The userId of the user
   * @returns Array of friend user objects
   */
  static async getFriends(userId: string): Promise<IUserDocument[]> {
    try {
      const user = await User.findOne({ userId });
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      const friends = await User.find({
        userId: { $in: user.friendRequests.accepted }
      }).select('-friendRequests.sent -friendRequests.received');
      
      return friends;
    } catch (error) {
      logger.error(`Error getting friends: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update user profile settings
   * @param userId The userId of the user
   * @param settings The new profile settings
   * @returns The updated user document
   */
  static async updateProfileSettings(
    userId: string, 
    settings: Partial<IUserDocument['profileSettings']>
  ): Promise<IUserDocument> {
    try {
      const updateData: Record<string, any> = {};
      
      // Only update provided fields
      Object.entries(settings).forEach(([key, value]) => {
        updateData[`profileSettings.${key}`] = value;
      });
      
      const user = await User.findOneAndUpdate(
        { userId },
        { $set: updateData },
        { new: true }
      );
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      logger.info(`Updated profile settings for user ${userId}`);
      return user;
    } catch (error) {
      logger.error(`Error updating profile settings: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update user analytics metrics
   * @param userId The userId of the user
   * @param metrics The metrics to update
   * @returns The updated user document
   */
  static async updateAnalyticsMetrics(
    userId: string,
    metrics: Partial<Pick<IUserDocument, 'totalCoursesCreated' | 'totalProjectsCreated' | 'totalPartnershipsInitiated' | 'totalPartnershipsReceived' | 'successRate'>>
  ): Promise<IUserDocument> {
    try {
      const user = await User.findOneAndUpdate(
        { userId },
        { $set: metrics },
        { new: true }
      );
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      logger.info(`Updated analytics metrics for user ${userId}`);
      return user;
    } catch (error) {
      logger.error(`Error updating analytics metrics: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Increment analytics metrics for a user
   * @param userId The userId of the user
   * @param field The field to increment
   * @param amount The amount to increment by (default: 1)
   * @returns The updated user document
   */
  static async incrementMetric(
    userId: string,
    field: 'totalCoursesCreated' | 'totalProjectsCreated' | 'totalPartnershipsInitiated' | 'totalPartnershipsReceived',
    amount: number = 1
  ): Promise<IUserDocument> {
    try {
      const updateQuery: Record<string, any> = {};
      updateQuery[field] = amount;
      
      const user = await User.findOneAndUpdate(
        { userId },
        { $inc: updateQuery },
        { new: true }
      );
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      logger.info(`Incremented ${field} by ${amount} for user ${userId}`);
      return user;
    } catch (error) {
      logger.error(`Error incrementing metric: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Calculate and update success rate for a user based on partnership data
   * @param userId The userId of the user
   * @returns The updated user document with recalculated success rate
   */
  static async recalculateSuccessRate(userId: string): Promise<IUserDocument> {
    try {
      const user = await User.findOne({ userId });
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Calculate success rate as: (approved partnerships / total partnerships) * 100
      const total = user.totalPartnershipsInitiated || 0;
      
      // Get the count of approved partnerships
      // This would typically come from querying the Partnership collection
      // For this example, we'll assume we have a method to get this count
      const approvedCount = await UserService.getApprovedPartnershipsCount(userId);
      
      const successRate = total > 0 ? (approvedCount / total) * 100 : 0;
      
      // Update the user with the calculated success rate
      return await User.findOneAndUpdate(
        { userId },
        { $set: { successRate: Math.round(successRate * 10) / 10 } }, // Round to 1 decimal place
        { new: true }
      ) as IUserDocument;
    } catch (error) {
      logger.error(`Error recalculating success rate: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Helper method to get count of approved partnerships
   * @param userId The userId of the user
   * @returns The count of approved partnerships
   */
  private static async getApprovedPartnershipsCount(userId: string): Promise<number> {
    // This would be implemented to query the Partnership collection
    // For now, we'll return a placeholder value
    // In a real implementation, this would query the Partnership collection
    logger.info(`Getting approved partnerships count for user ${userId}`);
    return 0; // Placeholder implementation
  }
}