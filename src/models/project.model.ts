// src/models/project.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';
import { CourseLevel } from './course.model';
import { createLogger } from '../config/logger';

const logger = createLogger('ProjectModel');

/**
 * Interface for Project document with methods
 */
interface IProjectDocument extends Document {
  creatorUserId: string;
  title: string;
  shortDescription: string;
  detailedDescription: string;
  aim: string;
  potentialSolution?: string;
  additionalInformation?: string;
  targetAcademicPartnership?: string;
  studentLevel: CourseLevel;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  year?: number;
  quarter?: number;
  fiscalYear?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Define method in the interface
  setTimeAnalyticsDimensions(): void;
}

/**
 * Interface for Project model
 */
interface IProjectModel extends Model<IProjectDocument> {
  // Add any static methods here if needed
}

/**
 * Project Schema for MongoDB (Snowflake Schema Design)
 */
const ProjectSchema = new Schema<IProjectDocument>(
  {
    creatorUserId: {
      type: String,
      required: true,
      index: true,
      comment: 'Amplify userId of the creator'
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    shortDescription: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    detailedDescription: {
      type: String,
      required: true,
      trim: true,
    },
    aim: {
      type: String,
      required: true,
      trim: true,
    },
    potentialSolution: {
      type: String,
      trim: true,
    },
    additionalInformation: {
      type: String,
      trim: true,
    },
    targetAcademicPartnership: {
      type: String,
      trim: true,
    },
    studentLevel: {
      type: String,
      enum: Object.values(CourseLevel),
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
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Derived time dimension fields to support analytical queries
    year: {
      type: Number,
      index: true,
    },
    quarter: {
      type: Number,
      min: 1,
      max: 4,
      index: true,
    },
    fiscalYear: {
      type: String,
      index: true,
    }
  },
  {
    timestamps: true,
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

// Add method to calculate time analytics dimensions
// Use 'this: IProjectDocument' to provide type information to TypeScript
ProjectSchema.methods.setTimeAnalyticsDimensions = function(this: IProjectDocument) {
  const startDate = this.startDate;
  
  // Extract year
  this.year = startDate.getFullYear();
  
  // Calculate quarter (1-4)
  const month = startDate.getMonth(); // 0-11
  this.quarter = Math.floor(month / 3) + 1;
  
  // Calculate fiscal year (assuming fiscal year starts in July)
  // e.g., July 2023 - June 2024 would be FY2024
  const fiscalYearStart = month >= 6 ? this.year : this.year - 1;
  const fiscalYearEnd = fiscalYearStart + 1;
  this.fiscalYear = `FY${fiscalYearEnd}`;
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

    // Calculate and set derived time dimension fields
    this.setTimeAnalyticsDimensions();
    
    next();
  } catch (error) {
    next(error instanceof Error ? error : new Error(String(error)));
  }
});

// Compound indexes for analytical queries
ProjectSchema.index({ creatorUserId: 1, studentLevel: 1 });
ProjectSchema.index({ year: 1, quarter: 1 });
ProjectSchema.index({ fiscalYear: 1, isActive: 1 });
ProjectSchema.index({ startDate: 1, endDate: 1 });

// Create and export the model with proper type information
export const Project = mongoose.model<IProjectDocument, IProjectModel>('Project', ProjectSchema);

// Re-export the interface for use in other files
export type IProject = IProjectDocument;