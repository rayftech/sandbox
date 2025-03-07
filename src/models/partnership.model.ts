// src/models/partnership.model.ts
import mongoose, { Document, Schema, Model, HydratedDocument, CallbackError } from 'mongoose';
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
 * Interface representing a partnership request
 */
export interface IPartnership extends Document {
  course: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  requestedTo: mongoose.Types.ObjectId;
  status: PartnershipStatus;
  requestMessage?: string;
  responseMessage?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
  completedAt?: Date;
  isComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Partnership Schema for MongoDB
 */
const PartnershipSchema = new Schema<IPartnership>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    requestedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(PartnershipStatus),
      default: PartnershipStatus.PENDING,
      required: true,
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
    },
    rejectedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    isComplete: {
      type: Boolean,
      default: false,
      index: true,
    },
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

// Middleware to ensure a course can only be in one approved partnership at a time
PartnershipSchema.pre('save', async function(next) {
  const partnership = this as unknown as HydratedDocument<IPartnership>;
  
  // If this partnership is being approved
  if (
    partnership.isModified('status') && 
    partnership.status === PartnershipStatus.APPROVED
  ) {
    try {
      // Check if course is already in an approved partnership
      const existingPartnership = await mongoose.model('Partnership').findOne({
        course: partnership.course,
        status: PartnershipStatus.APPROVED,
        _id: { $ne: partnership._id }
      });
      
      if (existingPartnership) {
        logger.warn(`Partnership validation failed: Course ${partnership.course} is already in an approved partnership`);
        const error = new Error('This course is already in an approved partnership');
        return next(error as CallbackError);
      }
      
      // Check if project is already in an approved partnership
      const existingProjectPartnership = await mongoose.model('Partnership').findOne({
        project: partnership.project,
        status: PartnershipStatus.APPROVED,
        _id: { $ne: partnership._id }
      });
      
      if (existingProjectPartnership) {
        logger.warn(`Partnership validation failed: Project ${partnership.project} is already in an approved partnership`);
        const error = new Error('This project is already in an approved partnership');
        return next(error as CallbackError);
      }
      
      // Set approval timestamp
      partnership.approvedAt = new Date();
      logger.info(`Partnership ${partnership._id} between course ${partnership.course} and project ${partnership.project} approved`);
    } catch (error) {
      logger.error(`Error in partnership pre-save hook: ${error instanceof Error ? error.message : String(error)}`);
      return next(error instanceof Error ? error as CallbackError : new Error(String(error)) as CallbackError);
    }
  }
  
  // Set rejection timestamp if being rejected
  if (
    partnership.isModified('status') && 
    partnership.status === PartnershipStatus.REJECTED
  ) {
    partnership.rejectedAt = new Date();
    logger.info(`Partnership ${partnership._id} between course ${partnership.course} and project ${partnership.project} rejected`);
  }
  
  // Set completed timestamp if being completed
  if (
    partnership.isModified('status') && 
    partnership.status === PartnershipStatus.COMPLETE
  ) {
    partnership.completedAt = new Date();
    partnership.isComplete = true;
    logger.info(`Partnership ${partnership._id} between course ${partnership.course} and project ${partnership.project} marked as complete`);
  }
  
  // Also update status if isComplete is manually changed
  if (partnership.isModified('isComplete') && partnership.isComplete && partnership.status !== PartnershipStatus.COMPLETE) {
    partnership.status = PartnershipStatus.COMPLETE;
    partnership.completedAt = partnership.completedAt || new Date();
    logger.info(`Partnership ${partnership._id} marked as complete via isComplete flag`);
  }
  
  next();
});

// Create compound indexes for query optimization
PartnershipSchema.index({ course: 1, project: 1 }, { unique: true });
PartnershipSchema.index({ requestedBy: 1, status: 1 });
PartnershipSchema.index({ requestedTo: 1, status: 1 });

// Create and export the model
export const Partnership = mongoose.model<IPartnership>('Partnership', PartnershipSchema);