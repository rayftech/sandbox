// src/models/project.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';
import { createLogger } from '../config/logger';
import { ItemLifecycleStatus, determineItemStatus } from './status.enum';

const logger = createLogger('ProjectModel');

/**
 * Enum for student level
 */
export enum StudentLevel {
  UNDERGRAD_EARLY = 'Undergraduate first & second year',
  UNDERGRAD_LATE = 'Undergraduate penultimate & final year',
  POSTGRAD = 'Postgraduate',
  OTHER = 'Other'
}

/**
 * Note: Target academic partnership is now a flexible string array
 * to support comma-separated values from frontend
 */

/**
 * Interface for rich text content blocks
 */
export interface IContentBlock {
  type: string;
  children: Array<{
    type?: string;
    text?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  }>;
}

/**
 * Interface for multimedia asset
 */
export interface IMultimediaAsset {
  url: string;
  name: string;
  mimeType: string;
  size: number;
  alt?: string;
  caption?: string;
}

/**
 * Interface for Project document with methods
 */
interface IProjectDocument extends Document {
  // Identifiers and metadata
  _id: mongoose.Types.ObjectId;
  userId: string;                      // Unique identifier for the user (creator)
  
  // Core project information
  name: string;                        // Project name
  shortDescription?: string;           // Brief overview of the project
  detailDescription?: IContentBlock[]; // Detailed project description
  aim?: IContentBlock[];               // Project goals and objectives
  potentialSolution?: IContentBlock[]; // Potential approaches or solutions
  additionalInformation?: IContentBlock[]; // Supplementary information
  
  // Classification and matching info
  targetAcademicPartnership?: string[] | string; // Target academic disciplines
  studentLevel: StudentLevel;          // Required student level for matching
  
  // Timeline information
  startDate: Date;                     // Project start date
  endDate: Date;                       // Project end date
  
  // Status information
  isActive: boolean;                   // Whether project is active
  status: ItemLifecycleStatus;         // Lifecycle status (upcoming, ongoing, completed)
  
  // Location and organization
  country: string;                     // Country where the project is based
  organisation?: string;               // Organization offering the project
  companyName?: string;                // Company name if different from organization
  
  // Additional attributes
  isPartnered?: boolean;               // Whether project has a partner
  multimedia?: IMultimediaAsset[];     // Associated media files
  
  // Analytics dimensions (for reporting)
  creationYear?: number;               // Year the project was created
  creationMonth?: number;              // Month the project was created (1-12)
  creationQuarter?: number;            // Quarter the project was created (1-4)
  
  // MongoDB timestamps
  createdAt: Date;                     // When this document was created
  updatedAt: Date;                     // When this document was last updated
  
  // Methods
  updateStatus(): boolean;             // Update status based on dates and return if it changed
  setTimeAnalyticsDimensions(): void;  // Calculate and set time analytics dimensions
}

/**
 * Interface for Project model with static methods
 */
interface IProjectModel extends Model<IProjectDocument> {
  // Static methods could be defined here if needed
}

/**
 * Project Schema for MongoDB
 * Single source of truth for project data
 */
const ProjectSchema = new Schema<IProjectDocument>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
      comment: 'User ID of the creator'
    },
    name: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    shortDescription: {
      type: String,
      trim: true
    },
    detailDescription: [{
      type: {
        type: String,
        required: true
      },
      children: [{
        type: { type: String },
        text: String,
        bold: Boolean,
        italic: Boolean,
        underline: Boolean
      }]
    }],
    aim: [{
      type: {
        type: String,
        required: true
      },
      children: [{
        type: { type: String },
        text: String,
        bold: Boolean,
        italic: Boolean,
        underline: Boolean
      }]
    }],
    potentialSolution: [{
      type: {
        type: String,
        required: true
      },
      children: [{
        type: { type: String },
        text: String,
        bold: Boolean,
        italic: Boolean,
        underline: Boolean
      }]
    }],
    additionalInformation: [{
      type: {
        type: String,
        required: true
      },
      children: [{
        type: { type: String },
        text: String,
        bold: Boolean,
        italic: Boolean,
        underline: Boolean
      }]
    }],
    targetAcademicPartnership: {
      type: [String],
      default: [],
      index: true
    },
    studentLevel: {
      type: String,
      enum: Object.values(StudentLevel),
      required: true,
      index: true
    },
    startDate: {
      type: Date,
      required: true,
      index: true
    },
    endDate: {
      type: Date,
      required: true,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    status: {
      type: String,
      enum: Object.values(ItemLifecycleStatus),
      default: ItemLifecycleStatus.UPCOMING,
      index: true
    },
    country: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    organisation: {
      type: String,
      trim: true,
      index: true
    },
    companyName: {
      type: String,
      trim: true
    },
    isPartnered: {
      type: Boolean,
      default: false
    },
    multimedia: [{
      url: {
        type: String,
        required: true
      },
      name: {
        type: String,
        required: true
      },
      mimeType: {
        type: String,
        required: true
      },
      size: {
        type: Number,
        required: true
      },
      alt: String,
      caption: String
    }],
    // Analytics dimensions
    creationYear: Number,
    creationMonth: Number,
    creationQuarter: Number
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Method to update status based on dates and return if it changed
ProjectSchema.methods.updateStatus = function(this: IProjectDocument): boolean {
  const isCompleted = !this.isActive && new Date() > this.endDate;
  const newStatus = determineItemStatus(this.startDate, this.endDate, isCompleted);
  
  if (this.status !== newStatus) {
    this.status = newStatus;
    return true; 
  }
  
  return false;
};

// Method to set time analytics dimensions
ProjectSchema.methods.setTimeAnalyticsDimensions = function(this: IProjectDocument) {
  // Use the document creation date
  const creationDate = this.createdAt || new Date();
  
  // Set analytics dimensions for time-based reporting
  this.creationYear = creationDate.getFullYear();
  this.creationMonth = creationDate.getMonth() + 1; // Convert to 1-12 format
  this.creationQuarter = Math.floor((creationDate.getMonth()) / 3) + 1; // Convert to quarter 1-4
  
  logger.debug(`Time analytics dimensions set for project ${this._id}`);
};

// Validation middleware with proper error handling
ProjectSchema.pre('save', function(this: IProjectDocument, next) {
  try {
    // Validate date range
    if (this.endDate <= this.startDate) {
      const error = new Error('End date must be after start date');
      logger.warn(`Project validation failed: End date must be after start date for project "${this.name}"`);
      return next(error);
    }
    
    // Update status
    this.updateStatus();
    
    // Set time analytics dimensions if this is a new document
    if (this.isNew) {
      this.setTimeAnalyticsDimensions();
    }
    
    next();
  } catch (error) {
    logger.error(`Error in project pre-save hook: ${error instanceof Error ? error.message : String(error)}`);
    next(error instanceof Error ? error : new Error(String(error)));
  }
});

// Create compound indexes for efficient queries
ProjectSchema.index({ userId: 1, studentLevel: 1 });
ProjectSchema.index({ startDate: 1, endDate: 1 });
ProjectSchema.index({ country: 1, studentLevel: 1 });
ProjectSchema.index({ status: 1, isActive: 1 });
ProjectSchema.index({ organisation: 1, country: 1 });
ProjectSchema.index({ name: 'text', shortDescription: 'text' }); // Text index for search

// Create and export the model with proper type information
export const Project = mongoose.model<IProjectDocument, IProjectModel>('Project', ProjectSchema);

// Re-export the interface for use in other files
export type IProject = IProjectDocument;