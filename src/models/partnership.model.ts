// src/models/partnership.model.ts
import mongoose, { Document, Schema, Model, CallbackError } from 'mongoose';
import { createLogger } from '../config/logger';

const logger = createLogger('PartnershipModel');

/**
 * Enum for partnership status
 */
export enum PartnershipStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELED = 'canceled',
  COMPLETE = 'complete'
}

/**
 * Interface for Partnership document with methods
 */
interface IPartnershipDocument extends Document {
  courseId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  requestedByUserId: string;
  requestedToUserId: string;
  status: PartnershipStatus;
  requestMessage?: string;
  responseMessage?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
  completedAt?: Date;
  isComplete: boolean;
  requestYear?: number;
  requestQuarter?: number;
  requestMonth?: number;
  approvalTimeInDays?: number;
  lifecycleDurationInDays?: number;
  createdAt: Date;
  updatedAt: Date;
  
  // Define method in the interface
  setTimeAnalyticsDimensions(): void;
}

/**
 * Interface for Partnership model
 */
interface IPartnershipModel extends Model<IPartnershipDocument> {
  // Add any static methods here if needed
}

/**
 * Partnership Schema for MongoDB (Central Fact Table in Snowflake Schema)
 */
const PartnershipSchema = new Schema<IPartnershipDocument>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    requestedByUserId: {
      type: String,
      required: true,
      index: true,
      comment: 'Amplify userId of the requester'
    },
    requestedToUserId: {
      type: String,
      required: true,
      index: true,
      comment: 'Amplify userId of the request recipient'
    },
    status: {
      type: String,
      enum: Object.values(PartnershipStatus),
      default: PartnershipStatus.PENDING,
      required: true,
      index: true,
    },
    requestMessage: {
      type: String,
      trim: true,
    },
    responseMessage: {
      type: String,
      trim: true,
    },
    approvedAt: {
      type: Date,
      index: true,
    },
    rejectedAt: {
      type: Date,
      index: true,
    },
    completedAt: {
      type: Date,
      index: true,
    },
    isComplete: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Derived analytic fields
    requestYear: {
      type: Number,
      index: true,
    },
    requestQuarter: {
      type: Number,
      min: 1,
      max: 4,
      index: true,
    },
    requestMonth: {
      type: Number,
      min: 1,
      max: 12,
      index: true,
    },
    approvalTimeInDays: {
      type: Number,
      index: true,
    },
    lifecycleDurationInDays: {
      type: Number,
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

// Method to set time analytics dimensions
// Use 'this: IPartnershipDocument' to provide type information to TypeScript
PartnershipSchema.methods.setTimeAnalyticsDimensions = function(this: IPartnershipDocument) {
  const requestDate = this.createdAt || new Date();
  
  this.requestYear = requestDate.getFullYear();
  this.requestMonth = requestDate.getMonth() + 1; // Convert from 0-11 to 1-12
  this.requestQuarter = Math.floor((requestDate.getMonth()) / 3) + 1; // Convert to quarter 1-4
};

// Middleware to ensure a course/project can only be in one approved partnership
// and to calculate analytics measures
PartnershipSchema.pre('save', async function(this: IPartnershipDocument, next) {
  try {
    // Set time analytics dimensions on creation
    if (this.isNew) {
      this.setTimeAnalyticsDimensions();
    }
    
    // If this partnership is being approved
    if (
      this.isModified('status') && 
      this.status === PartnershipStatus.APPROVED
    ) {
      // Check if course is already in an approved partnership
      const Partnership = mongoose.model<IPartnershipDocument>('Partnership');
      const existingPartnership = await Partnership.findOne({
        courseId: this.courseId,
        status: PartnershipStatus.APPROVED,
        _id: { $ne: this._id }
      });
      
      if (existingPartnership) {
        logger.warn(`Partnership validation failed: Course ${this.courseId} is already in an approved partnership`);
        const error = new Error('This course is already in an approved partnership');
        return next(error as CallbackError);
      }
      
      // Check if project is already in an approved partnership
      const existingProjectPartnership = await Partnership.findOne({
        projectId: this.projectId,
        status: PartnershipStatus.APPROVED,
        _id: { $ne: this._id }
      });
      
      if (existingProjectPartnership) {
        logger.warn(`Partnership validation failed: Project ${this.projectId} is already in an approved partnership`);
        const error = new Error('This project is already in an approved partnership');
        return next(error as CallbackError);
      }
      
      // Set approval timestamp
      this.approvedAt = new Date();
      
      // Calculate approval time in days
      this.approvalTimeInDays = Math.round(
        (this.approvedAt.getTime() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      logger.info(`Partnership ${this._id} between course ${this.courseId} and project ${this.projectId} approved`);
    }
    
    // Set rejection timestamp if being rejected
    if (
      this.isModified('status') && 
      this.status === PartnershipStatus.REJECTED
    ) {
      this.rejectedAt = new Date();
      logger.info(`Partnership ${this._id} between course ${this.courseId} and project ${this.projectId} rejected`);
    }
    
    // Set completed timestamp if being completed
    if (
      this.isModified('status') && 
      this.status === PartnershipStatus.COMPLETE
    ) {
      this.completedAt = new Date();
      this.isComplete = true;
      
      // Calculate lifecycle duration in days
      this.lifecycleDurationInDays = Math.round(
        (this.completedAt.getTime() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      logger.info(`Partnership ${this._id} between course ${this.courseId} and project ${this.projectId} marked as complete`);
    }
    
    // Also update status if isComplete is manually changed
    if (this.isModified('isComplete') && this.isComplete && this.status !== PartnershipStatus.COMPLETE) {
      this.status = PartnershipStatus.COMPLETE;
      this.completedAt = this.completedAt || new Date();
      
      // Calculate lifecycle duration in days
      this.lifecycleDurationInDays = Math.round(
        (this.completedAt.getTime() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      logger.info(`Partnership ${this._id} marked as complete via isComplete flag`);
    }
    
    next();
  } catch (error) {
    logger.error(`Error in partnership pre-save hook: ${error instanceof Error ? error.message : String(error)}`);
    return next(error instanceof Error ? error as CallbackError : new Error(String(error)) as CallbackError);
  }
});

// Create compound indexes for query optimization and analytical queries
PartnershipSchema.index({ courseId: 1, projectId: 1 }, { unique: true });
PartnershipSchema.index({ requestedByUserId: 1, status: 1 });
PartnershipSchema.index({ requestedToUserId: 1, status: 1 });
PartnershipSchema.index({ requestYear: 1, requestQuarter: 1 });
PartnershipSchema.index({ approvalTimeInDays: 1 });
PartnershipSchema.index({ lifecycleDurationInDays: 1 });
PartnershipSchema.index({ status: 1, requestYear: 1, requestQuarter: 1 });

// Create and export the model with proper type information
export const Partnership = mongoose.model<IPartnershipDocument, IPartnershipModel>('Partnership', PartnershipSchema);

// Re-export the interface for use in other files
export type IPartnership = IPartnershipDocument;