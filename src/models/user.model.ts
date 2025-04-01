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
  country: string;
  organisation?: string;
  fieldOfExpertise?: string;
}

/**
 * Interface for saved item reference
 */
export interface ISavedItem {
  itemId: mongoose.Types.ObjectId;
  itemType: 'course' | 'project';
  savedAt: Date;
  notes?: string;
}

export interface ISavedItemDocument extends ISavedItem, Document {
  toObject(options?: any): ISavedItem;
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
  // Watch/Save feature
  savedItems: ISavedItem[]; // Array of saved/watched courses and projects
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
  logUserCreation(): void;
  
  // Methods for saved items
  saveItem(itemId: mongoose.Types.ObjectId | string, itemType: 'course' | 'project', notes?: string): Promise<ISavedItem>;
  unsaveItem(itemId: mongoose.Types.ObjectId | string, itemType: 'course' | 'project'): Promise<boolean>;
  isSaved(itemId: mongoose.Types.ObjectId | string, itemType: 'course' | 'project'): boolean;
}

/**
 * Interface for User model with static methods
 */
interface IUserModel extends Model<IUserDocument> {
  // Add any static methods here if needed
  logModelInitialization(): void;
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
      }],
    },
    
    // Watch/Save feature - New addition
    savedItems: [{
      itemId: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'savedItems.itemType' // Dynamic reference based on itemType
      },
      itemType: {
        type: String,
        required: true,
        enum: ['course', 'project']
      },
      savedAt: {
        type: Date,
        default: Date.now
      },
      notes: {
        type: String,
        trim: true
      }
    }],
    
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
    },

    // New fields from Amplify auth return
    country: {
      type: String,
      trim: true,
      index: true,
    },
    organisation: {
      type: String,
      trim: true,
      index: true,
    },
    fieldOfExpertise: {
      type: String,
      trim: true,
    }
  },
  
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Instance method to log user creation
UserSchema.methods.logUserCreation = function() {
  logger.info(`New user created: ${this.userId} (${this.email})`);
};

// Method to save an item (course or project)
UserSchema.methods.saveItem = async function(
  itemId: mongoose.Types.ObjectId | string,
  itemType: 'course' | 'project',
  notes?: string
): Promise<ISavedItem> {
  // Convert string ID to ObjectId if needed
  const objectId = typeof itemId === 'string' ? new mongoose.Types.ObjectId(itemId) : itemId;
  
  // Check if item is already saved
  const alreadySaved = this.savedItems.some((item: ISavedItem) => 
    item.itemId.equals(objectId) && item.itemType === itemType
  );
  
  if (alreadySaved) {
    // If it's already saved, update the notes and savedAt time
    const savedItem = this.savedItems.find((item: ISavedItem) => 
      item.itemId.equals(objectId) && item.itemType === itemType
    );
    
    if (savedItem) {
      savedItem.savedAt = new Date();
      if (notes !== undefined) {
        savedItem.notes = notes;
      }
      
      await this.save();
      return savedItem;
    }
  }
  
  // If not saved, add it to savedItems
  const newSavedItem: ISavedItem = {
    itemId: objectId,
    itemType,
    savedAt: new Date(),
    notes
  };
  
  this.savedItems.push(newSavedItem);
  await this.save();
  
  logger.info(`User ${this.userId} saved ${itemType} ${itemId}`);
  return newSavedItem;
};

// Method to unsave an item
UserSchema.methods.unsaveItem = async function(
  itemId: mongoose.Types.ObjectId | string,
  itemType: 'course' | 'project'
): Promise<boolean> {
  // Convert string ID to ObjectId if needed
  const objectId = typeof itemId === 'string' ? new mongoose.Types.ObjectId(itemId) : itemId;
  
  // Get initial count of saved items
  const initialCount = this.savedItems.length;
  
  // Filter out the item to unsave
  this.savedItems = this.savedItems.filter((item: ISavedItem) => 
    !(item.itemId.equals(objectId) && item.itemType === itemType)
  );
  
  // Check if any item was removed
  if (this.savedItems.length < initialCount) {
    await this.save();
    logger.info(`User ${this.userId} unsaved ${itemType} ${itemId}`);
    return true;
  }
  
  return false; // Item wasn't in saved items
};

// Method to check if an item is saved
UserSchema.methods.isSaved = function(
  itemId: mongoose.Types.ObjectId | string,
  itemType: 'course' | 'project'
): boolean {
  // Convert string ID to ObjectId if needed
  const objectId = typeof itemId === 'string' ? new mongoose.Types.ObjectId(itemId) : itemId;
  
  return this.savedItems.some((item: ISavedItem) => 
    item.itemId.equals(objectId) && item.itemType === itemType
  );
};

// Static method to log model initialization
UserSchema.statics.logModelInitialization = function() {
  logger.info('User model initialized');
};

// Compound indexes for better query performance
UserSchema.index({ userType: 1, isAdmin: 1 });
UserSchema.index({ lastName: 1, firstName: 1 });
UserSchema.index({ 'friendRequests.accepted': 1 });
UserSchema.index({ 'friendRequests.sent': 1 });
UserSchema.index({ 'friendRequests.received': 1 });
UserSchema.index({ country: 1, organisation: 1 });
// Add index for the new savedItems feature
UserSchema.index({ 'savedItems.itemType': 1, 'savedItems.itemId': 1 });
UserSchema.index({ 'savedItems.savedAt': -1 }); // For sorting by most recently saved

// Log model initialization
logger.info('Configuring User model');

// Create and export the model with proper type information
export const User = mongoose.model<IUserDocument, IUserModel>('User', UserSchema);

// Call static method to log initialization
User.logModelInitialization();

// Re-export the interface for use in other files
export type IUser = IUserDocument;