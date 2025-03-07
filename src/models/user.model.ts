// src/models/user.model.ts
import mongoose, { Document, Model, Schema, HydratedDocument } from 'mongoose';
import { createLogger } from '../config/logger';

const logger = createLogger('UserModel');

/**
 * Interface for User attributes (without mongoose Document properties)
 */
export interface IUserAttributes {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'academic' | 'industry' | 'admin';
  isAdmin: boolean;
  shortDescription?: string;
  fieldOfExpertise?: string[];
  // Academic specific fields
  academicTitle?: string;
  academicInstitution?: string;
  faculty?: string;
  school?: string;
  // Industry specific fields
  jobTitle?: string;
  department?: string;
  company?: string;
}

/**
 * Interface that extends Document for User model
 */
export interface IUser extends Document {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'academic' | 'industry' | 'admin';
  isAdmin: boolean;
  shortDescription?: string;
  fieldOfExpertise?: string[];
  // Academic specific fields
  academicTitle?: string;
  academicInstitution?: string;
  faculty?: string;
  school?: string;
  // Industry specific fields
  jobTitle?: string;
  department?: string;
  company?: string;
  // Common fields
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User Schema for MongoDB
 */
const UserSchema = new Schema<IUser>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
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
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    shortDescription: {
      type: String,
      trim: true,
    },
    fieldOfExpertise: [{
      type: String,
      trim: true,
    }],
    // Academic specific fields
    academicTitle: {
      type: String,
      trim: true,
    },
    academicInstitution: {
      type: String,
      trim: true,
    },
    faculty: {
      type: String,
      trim: true,
    },
    school: {
      type: String,
      trim: true,
    },
    // Industry specific fields
    jobTitle: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    company: {
      type: String,
      trim: true,
    },
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

// Indexes for better query performance
UserSchema.index({ userType: 1 });
UserSchema.index({ company: 1 }, { sparse: true });
UserSchema.index({ academicInstitution: 1 }, { sparse: true });

// Middleware for validation with proper type handling
UserSchema.pre('save', function(next) {
  // Use type assertion with unknown first to avoid TypeScript error
  // This is safe because 'this' in Mongoose hooks is the document being saved
  const user = this as unknown as HydratedDocument<IUser>;
  
  // Validate fields based on userType
  if (user.userType === 'academic') {
    if (!user.academicTitle || !user.academicInstitution) {
      logger.warn(`Academic user ${user.email} missing required academic fields`);
    }
  } else if (user.userType === 'industry') {
    if (!user.jobTitle || !user.company) {
      logger.warn(`Industry user ${user.email} missing required industry fields`);
    }
  }
  
  next();
});

// Create and export the model with proper type
export const User = mongoose.model<IUser>('User', UserSchema);