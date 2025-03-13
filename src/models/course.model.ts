// src/models/course.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';
import { createLogger } from '../config/logger';
import { ItemLifecycleStatus, determineItemStatus } from './status.enum';

const logger = createLogger('CourseModel');

/**
 * Enum for course level
 */
export enum CourseLevel {
  UNDERGRAD_EARLY = 'undergraduate 1st & 2nd year',
  UNDERGRAD_LATE = 'undergraduate penultimate & final year',
  POSTGRAD = 'postgraduate',
  OTHER = 'other'
}

/**
 * Interface for Course methods
 */
interface ICourseDocument extends Document {
  creatorUserId: string;
  name: string;
  code: string;
  level: CourseLevel;
  expectedEnrollment: number;
  description: string;
  assessmentRedesign?: string;
  targetIndustryPartnership?: string;
  preferredPartnerRepresentative?: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  status: ItemLifecycleStatus;
  academicYear?: string;
  semester?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Add method definition to interface
  setAcademicYearAndSemester(): void;
}

/**
 * Interface for Course model
 */
interface ICourseModel extends Model<ICourseDocument> {
  // Add any static methods here if needed
}

/**
 * Course Schema for MongoDB (Snowflake Schema Design)
 */
const CourseSchema = new Schema<ICourseDocument>(
  {
    creatorUserId: {
      type: String,
      required: true,
      index: true,
      comment: 'Amplify userId of the creator'
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
    },
    level: {
      type: String,
      enum: Object.values(CourseLevel),
      required: true,
      index: true,
    },
    expectedEnrollment: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    assessmentRedesign: {
      type: String,
      trim: true,
    },
    targetIndustryPartnership: {
      type: String,
      trim: true,
    },
    preferredPartnerRepresentative: {
      type: String,
      trim: true,
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
    status:{
      type: String,
      enum: Object.values(ItemLifecycleStatus),
      default: ItemLifecycleStatus.UPCOMING,
      index:true
    },
    // Derived time dimension fields to support analytical queries
    academicYear: {
      type: String,
      index: true,
    },
    semester: {
      type: String,
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

// calculate academic year and semester
CourseSchema.methods.setAcademicYearAndSemester = function(this: ICourseDocument) {
  const startDate = this.startDate;
  
  // Calculate academic year (e.g., "2024-2025")
  const startYear = startDate.getFullYear();
  const month = startDate.getMonth(); // 0-11
  
  // For academic year, typically if start month is after August, 
  // the academic year is startYear/startYear+1
  this.academicYear = month >= 8 
    ? `${startYear}-${startYear + 1}`
    : `${startYear - 1}-${startYear}`;
  
  // Calculate semester
  if (month >= 8 && month <= 11) {
    this.semester = 'Fall';
  } else if (month >= 0 && month <= 4) {
    this.semester = 'Spring';
  } else {
    this.semester = 'Summer';
  }
};

// 
CourseSchema.methods.updateStatus = function(this: ICourseDocument) {
  const isCompleted = !this.isActive && new Date() > this.endDate;
  this.status = determineItemStatus(this.startDate, this.endDate, isCompleted);
};

// Validation middleware with proper type handling
CourseSchema.pre('save', function(this: ICourseDocument, next) {
  try {
    // Basic validation
    if (this.endDate <= this.startDate) {
      const error = new Error('End date must be after start date');
      logger.warn(`Course validation failed: End date must be after start date for course ${this.name}`);
      return next(error);
    }

    // Calculate and set derived time dimension fields
    this.setAcademicYearAndSemester();
    
    next();
  } catch (error) {
    next(error instanceof Error ? error : new Error(String(error)));
  }
});

// Compound indexes for analytical queries
CourseSchema.index({ creatorUserId: 1, level: 1 });
CourseSchema.index({ academicYear: 1, semester: 1 });
CourseSchema.index({ startDate: 1, endDate: 1, isActive: 1 });

// Create and export the model with proper type
export const Course = mongoose.model<ICourseDocument, ICourseModel>('Course', CourseSchema);

// Export the interface for use in other files
export type ICourse = ICourseDocument;