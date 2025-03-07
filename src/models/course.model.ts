// src/models/course.model.ts
import mongoose, { Document, Model, Schema, HydratedDocument } from 'mongoose';
import { createLogger } from '../config/logger';

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
 * Interface representing a Course document in MongoDB
 */
export interface ICourse extends Document {
  creator: mongoose.Types.ObjectId;
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
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Course Schema for MongoDB
 */
const CourseSchema = new Schema<ICourse>(
  {
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
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
    },
    endDate: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Validation middleware with proper type handling
CourseSchema.pre('save', function(next) {
  // Use type assertion with unknown first to avoid TypeScript error
  // This is safe because 'this' in Mongoose hooks is the document being saved
  const course = this as unknown as HydratedDocument<ICourse>;

  if (course.endDate <= course.startDate) {
    const error = new Error('End date must be after start date');
    logger.warn(`Course validation failed: End date must be after start date for course ${course.name}`);
    return next(error);
  }
  next();
});

// Indexes for better query performance
CourseSchema.index({ creator: 1 });
CourseSchema.index({ level: 1 });
CourseSchema.index({ startDate: 1, endDate: 1 });

// Create and export the model
export const Course = mongoose.model<ICourse>('Course', CourseSchema);