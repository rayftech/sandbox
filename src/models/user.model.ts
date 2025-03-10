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
