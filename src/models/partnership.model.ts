// src/models/partnership.model.ts
import mongoose, { Document, Schema, Model, CallbackError } from 'mongoose';
import { createLogger } from '../config/logger';
import { ItemLifecycleStatus, determineItemStatus } from './status.enum';

const logger = createLogger('PartnershipModel');

/**
 * Enum for partnership status
 */
export enum PartnershipStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELED = 'canceled',
  UPCOMING = 'upcoming',
  ONGOING = 'ongoing',
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
  lifecycleStatus?: ItemLifecycleStatus;
  requestMessage?: string;
  responseMessage?: string;
  messages?: Array<{
    userId: string;
    message: string;
    timestamp: Date;
  }>;
  startDate?: Date;
  endDate?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  canceledAt?: Date;
  completedAt?: Date;
  isComplete: boolean;
  requestYear?: number;
  requestQuarter?: number;
  requestMonth?: number;
  approvalTimeInDays?: number;
  partnershipDurationInDays?: number;
  successMetrics?: {
    satisfaction?: number;
    completionRate?: number;
    goalAchievement?: number;
  };
  createdAt: Date;
  updatedAt: Date;
  
  // Define methods in the interface
  setTimeAnalyticsDimensions(): void;
  updateLifecycleStatus(): void;
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
    lifecycleStatus: {
      type: String,
      enum: Object.values(ItemLifecycleStatus),
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
    messages: [{
      userId: {
        type: String,
        required: true,
      },
      message: {
        type: String,
        required: true,
        trim: true,
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],
    startDate: {
      type: Date,
      index: true,
    },
    endDate: {
      type: Date,
      index: true,
    },
    approvedAt: {
      type: Date,
      index: true,
    },
    rejectedAt: {
      type: Date,
      index: true,
    },
    canceledAt: {
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
    partnershipDurationInDays: {
      type: Number,
      index: true,
    },
    successMetrics: {
      satisfaction: {
        type: Number,
        min: 0,
        max: 10
      },
      completionRate: {
        type: Number,
        min: 0,
        max: 100
      },
      goalAchievement: {
        type: Number,
        min: 0,
        max: 100
      }
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

// Method to update lifecycle status based on dates
PartnershipSchema.methods.updateLifecycleStatus = function(this: IPartnershipDocument) {
  // Only applicable for approved partnerships with start and end dates
  if (this.status !== PartnershipStatus.APPROVED || !this.startDate || !this.endDate) {
    return;
  }
  
  // Use the helper function from status.enum.ts
  this.lifecycleStatus = determineItemStatus(this.startDate, this.endDate, this.isComplete);
  
  // Also update the partnership status to match the lifecycle status
  if (this.lifecycleStatus === ItemLifecycleStatus.UPCOMING) {
    this.status = PartnershipStatus.UPCOMING;
  } else if (this.lifecycleStatus === ItemLifecycleStatus.ONGOING) {
    this.status = PartnershipStatus.ONGOING;
  } else if (this.lifecycleStatus === ItemLifecycleStatus.COMPLETED && !this.isComplete) {
    this.status = PartnershipStatus.COMPLETE;
    this.isComplete = true;
    this.completedAt = new Date();
  }
};

// Middleware to ensure a course/project can only be in one approved partnership
// and to calculate analytics measures
PartnershipSchema.pre('save', async function(this: IPartnershipDocument, next) {
  try {
    // Set time analytics dimensions on creation
    if (this.isNew) {
      this.setTimeAnalyticsDimensions();
    }
    
    // Validate status transitions
    if (this.isModified('status')) {
      const oldStatus = this.isNew ? null : this.get('status', String);
      const newStatus = this.status;

      // Handle status transition validations
      if (oldStatus === PartnershipStatus.REJECTED && newStatus !== PartnershipStatus.REJECTED) {
        return next(new Error('Cannot change status once a partnership has been rejected') as CallbackError);
      }
      
      if (oldStatus === PartnershipStatus.CANCELED && newStatus !== PartnershipStatus.CANCELED) {
        return next(new Error('Cannot change status once a partnership has been canceled') as CallbackError);
      }
      
      if (oldStatus === PartnershipStatus.COMPLETE && newStatus !== PartnershipStatus.COMPLETE) {
        return next(new Error('Cannot change status once a partnership has been completed') as CallbackError);
      }
      
      // Validate status flow
      if (newStatus === PartnershipStatus.CANCELED && oldStatus !== PartnershipStatus.PENDING) {
        return next(new Error('Only pending partnerships can be canceled') as CallbackError);
      }
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
        status: { $in: [PartnershipStatus.APPROVED, PartnershipStatus.UPCOMING, PartnershipStatus.ONGOING] },
        _id: { $ne: this._id }
      });
      
      if (existingPartnership) {
        logger.warn(`Partnership validation failed: Course ${this.courseId} is already in an active partnership`);
        const error = new Error('This course is already in an active partnership');
        return next(error as CallbackError);
      }
      
      // Check if project is already in an approved partnership
      const existingProjectPartnership = await Partnership.findOne({
        projectId: this.projectId,
        status: { $in: [PartnershipStatus.APPROVED, PartnershipStatus.UPCOMING, PartnershipStatus.ONGOING] },
        _id: { $ne: this._id }
      });
      
      if (existingProjectPartnership) {
        logger.warn(`Partnership validation failed: Project ${this.projectId} is already in an active partnership`);
        const error = new Error('This project is already in an active partnership');
        return next(error as CallbackError);
      }
      
      // Set approval timestamp
      this.approvedAt = new Date();
      
      // Calculate approval time in days
      this.approvalTimeInDays = Math.round(
        (this.approvedAt.getTime() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // Update lifecycle status if dates are present
      if (this.startDate && this.endDate) {
        this.updateLifecycleStatus();
      }
      
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
    
    // Set cancelation timestamp if being canceled
    if (
      this.isModified('status') && 
      this.status === PartnershipStatus.CANCELED
    ) {
      this.canceledAt = new Date();
      logger.info(`Partnership ${this._id} between course ${this.courseId} and project ${this.projectId} canceled by requester`);
    }
    
    // Update lifecycle status any time dates are modified
    if ((this.isModified('startDate') || this.isModified('endDate')) && this.startDate && this.endDate) {
      this.updateLifecycleStatus();
    }
    
    // Set completed timestamp if being completed
    if (
      this.isModified('status') && 
      this.status === PartnershipStatus.COMPLETE
    ) {
      this.completedAt = new Date();
      this.isComplete = true;
      
      // Calculate partnership duration in days
      if (this.approvedAt) {
        this.partnershipDurationInDays = Math.round(
          (this.completedAt.getTime() - this.approvedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
      
      logger.info(`Partnership ${this._id} between course ${this.courseId} and project ${this.projectId} marked as complete`);
    }
    
    // Also update status if isComplete is manually changed
    if (this.isModified('isComplete') && this.isComplete && this.status !== PartnershipStatus.COMPLETE) {
      this.status = PartnershipStatus.COMPLETE;
      this.completedAt = this.completedAt || new Date();
      
      // Calculate partnership duration in days
      if (this.approvedAt) {
        this.partnershipDurationInDays = Math.round(
          (this.completedAt.getTime() - this.approvedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
      
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
PartnershipSchema.index({ status: 1, lifecycleStatus: 1 });
PartnershipSchema.index({ startDate: 1, endDate: 1 });
PartnershipSchema.index({ requestYear: 1, requestQuarter: 1 });
PartnershipSchema.index({ approvalTimeInDays: 1 });
PartnershipSchema.index({ partnershipDurationInDays: 1 });
PartnershipSchema.index({ status: 1, requestYear: 1, requestQuarter: 1 });
PartnershipSchema.index({ 'successMetrics.satisfaction': 1 });
PartnershipSchema.index({ 'successMetrics.completionRate': 1 });

// Create and export the model with proper type information
export const Partnership = mongoose.model<IPartnershipDocument, IPartnershipModel>('Partnership', PartnershipSchema);

// Re-export the interface for use in other files
export type IPartnership = IPartnershipDocument;