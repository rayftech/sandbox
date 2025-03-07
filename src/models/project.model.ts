// src/models/project.model.ts
import mongoose, { Document, Model, Schema, HydratedDocument } from 'mongoose';
import { CourseLevel } from './course.model';
import { createLogger } from '../config/logger';

const logger = createLogger('ProjectModel');

/**
 * Interface representing a Project document in MongoDB
 */
export interface IProject extends Document {
  creator: mongoose.Types.ObjectId;
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
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Project Schema for MongoDB
 */
const ProjectSchema = new Schema<IProject>(
  {
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
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
ProjectSchema.pre('save', function(next) {
  // Use type assertion with unknown first to avoid TypeScript error
  const project = this as unknown as HydratedDocument<IProject>;
  
  if (project.endDate <= project.startDate) {
    const error = new Error('End date must be after start date');
    logger.warn(`Project validation failed: End date must be after start date for project "${project.title}"`);
    return next(error);
  }
  next();
});

// Indexes for better query performance
ProjectSchema.index({ creator: 1 });
ProjectSchema.index({ studentLevel: 1 });
ProjectSchema.index({ startDate: 1, endDate: 1 });

// Create and export the model
export const Project = mongoose.model<IProject>('Project', ProjectSchema);