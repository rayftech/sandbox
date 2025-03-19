// src/models/project.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';
import { createLogger } from '../config/logger';
import { ItemLifecycleStatus, determineItemStatus } from './status.enum';

const logger = createLogger('ProjectModel');

/**
 * Enum for student level (should match Strapi schema)
 */
export enum StudentLevel {
  UNDERGRAD_EARLY = 'Undergraduate 1st & 2nd year',
  UNDERGRAD_LATE = 'Undergraduate penultimate & final year',
  POSTGRAD = 'Postgraduate',
  OTHER = 'Other'
}

/**
 * Interface for Project document with methods
 * This is a lightweight version that references Strapi content
 */
interface IProjectDocument extends Document {
  // Identifiers
  _id:mongoose.Types.ObjectId;
  creatorUserId: string;                  // Amplify userId of the creator
  strapiId: string;                       // ID of the corresponding Strapi challenge
  strapiCreatedAt: Date;                  // When the content was created in Strapi
  strapiUpdatedAt: Date;                  // When the content was last updated in Strapi

  
  // Essential data needed for relationship management and searching
  title: string;                         // Name of the project (from Strapi)
  studentLevel: StudentLevel;            // Required for matching with courses
  startDate: Date;                       // For determining lifecycle and partnerships
  endDate: Date;                         // For determining lifecycle and partnerships
  country: string;                       // For geographic filtering
  targetAcademicPartnership?:string;
  
  // Status fields
  isActive: boolean;                     // Whether this project is active
  status: ItemLifecycleStatus;           // Lifecycle status (upcoming, ongoing, completed)
  
  // MongoDB timestamps
  createdAt: Date;                       // When this MongoDB document was created
  updatedAt: Date;                       // When this MongoDB document was last updated
  
  // Methods
  updateStatus(): boolean;               // Update status based on dates and return if it changed
}

/**
 * Interface for Project model
 */
interface IProjectModel extends Model<IProjectDocument> {
  // Add any static methods here if needed
}

/**
 * Project Schema for MongoDB
 * This schema represents the relationship between users and Strapi challenges
 */
const ProjectSchema = new Schema<IProjectDocument>(
  {
    creatorUserId: {
      type: String,
      required: true,
      index: true,
      comment: 'Amplify userId of the creator'
    },
    strapiId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      comment: 'ID of the corresponding challenge in Strapi CMS'
    },
    strapiCreatedAt: {
      type: Date,
      required: true
    },
    strapiUpdatedAt: {
      type: Date,
      required: true
    },
    title: {
      type: String,
      required: true,
      index: true,
    },
    studentLevel: {
      type: String,
      enum: Object.values(StudentLevel),
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    country: {
      type: String,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ItemLifecycleStatus),
      default: ItemLifecycleStatus.UPCOMING,
      index: true,
    }
  },
  {
    timestamps: true,
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

// Add method to update status based on dates and return if it changed
ProjectSchema.methods.updateStatus = function(this: IProjectDocument): boolean {
  const isCompleted = !this.isActive && new Date() > this.endDate;
  const newStatus = determineItemStatus(this.startDate, this.endDate, isCompleted);
  
  if (this.status !== newStatus) {
    this.status = newStatus;
    return true; 
  }
  
  return false;
};

// Validation middleware with proper type handling
ProjectSchema.pre('save', function(this: IProjectDocument, next) {
  try {
    // Basic validation
    if (this.endDate <= this.startDate) {
      const error = new Error('End date must be after start date');
      logger.warn(`Project validation failed: End date must be after start date for project "${this.title}"`);
      return next(error);
    }
    
    // Update status
    this.updateStatus();
    
    next();
  } catch (error) {
    next(error instanceof Error ? error : new Error(String(error)));
  }
});

// Create compound indexes for efficient queries
ProjectSchema.index({ creatorUserId: 1, studentLevel: 1 });
ProjectSchema.index({ startDate: 1, endDate: 1 });
ProjectSchema.index({ country: 1, studentLevel: 1 });
ProjectSchema.index({ status: 1, isActive: 1 });

// Create and export the model with proper type information
export const Project = mongoose.model<IProjectDocument, IProjectModel>('Project', ProjectSchema);

// Re-export the interface for use in other files
export type IProject = IProjectDocument;