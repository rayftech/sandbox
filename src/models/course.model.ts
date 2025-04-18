// src/models/course.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';
import { createLogger } from '../config/logger';
import { ItemLifecycleStatus, determineItemStatus } from './status.enum';

const logger = createLogger('CourseModel');

/**
 * Enum for course level
 */
export enum CourseLevel {
  UNDERGRAD_EARLY = 'Undergraduate first & second year',
  UNDERGRAD_LATE = 'Undergraduate penultimate & final year',
  POSTGRAD = 'Postgraduate',
  OTHER = 'Other'
}

/**
 * Interface for rich text content blocks
 */
export interface IContentBlock {
  type: string;  // paragraph, heading, list, etc.
  children: Array<{
    type?: string;
    text?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  }>;
}

/**
 * Interface for multimedia file
 */
interface IMultimediaFile {
  fileId: string;
  type: 'image' | 'file' | 'video' | 'audio';
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

/**
 * Interface for localization content
 */
interface ILocalizationContent {
  name: string;
  description: IContentBlock[];  // Rich text description
  targetIndustryPartnership: string[] | string;
  preferredPartnerRepresentative: string;
}

/**
 * Interface for Course document with methods
 * Self-contained model with all course data in MongoDB
 */
interface ICourseDocument extends Document {
  // Identifiers
  _id: mongoose.Types.ObjectId;
  creatorUserId: string;                  // Amplify userId of the creator
  
  // Essential data needed for relationship management and searching
  name: string;                          // Name of the course
  code: string;                          // Course code
  level: CourseLevel;                    // Required for matching with projects
  startDate: Date;                       // For determining lifecycle and partnerships
  endDate: Date;                         // For determining lifecycle and partnerships
  country: string;                       // For geographic filtering
  organisation: string;                  // Academic/educational organisation offering the course
  
  // text input fields
  description: IContentBlock[];         // Course description in rich text format
  assessmentRedesign: IContentBlock[]; // Assessment redesign information in rich text format
  expectedEnrollment: number;           // Expected number of students
  targetIndustryPartnership: string[] | string;  // Target industry fields for partnership
  preferredPartnerRepresentative: string; // Preferred industry representative
  
  // Partnership field
  partnerId: mongoose.Types.ObjectId;    // stored parntered project Id here
  
  // Multimedia files
  multimedia: IMultimediaFile[];
  
  // Localization support
  localizations: Map<string, ILocalizationContent>;
  
  // Status fields
  isActive: boolean;                     // Whether this course is active
  status: ItemLifecycleStatus;           // Lifecycle status (upcoming, ongoing, completed)
  isPrivate: boolean;                    // If true, course is only visible to its owner
  
  // Time-based analytics dimensions (for reporting)
  academicYear?: string;                 // Example: "2023-2024"
  semester?: string;                     // Example: "Fall", "Spring", "Summer"
  
  // MongoDB timestamps
  createdAt: Date;                       // When this MongoDB document was created
  updatedAt: Date;                       // When this MongoDB document was last updated
  
  // Methods
  setAcademicYearAndSemester(): void;    // Calculate academic year and semester
  updateStatus(): boolean;               // Update status based on dates and return if it changed
}

/**
 * Interface for Course model
 */
interface ICourseModel extends Model<ICourseDocument> {
  // Add any static methods here if needed
}

// Define Multimedia schema
const MultimediaSchema = new Schema({
  fileId: String,
  type: {
    type: String,
    enum: ['image', 'file', 'video', 'audio'],
  },
  url: String,
  name: String,
  size: Number,
  mimeType: String
}, { _id: false });

// Define Localization schema
const LocalizationSchema = new Schema({
  name: String,
  description: [{
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
  targetIndustryPartnership: String,
  preferredPartnerRepresentative: String,
}, { _id: false });

/**
 * Course Schema for MongoDB
 * Self-contained model with all course data in MongoDB
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
      index: true,
    },
    code: {
      type: String,
      required: true,
      index: true,
    },
    level: {
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
    country: {
      type: String,
      required: true,
      index: true,
    },
    organisation: {
      type: String,
      required: false,
      index: true,
      default: '',
    },
    // Enhanced fields
    description: [{
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
    assessmentRedesign: [{
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
    expectedEnrollment: {
      type: Number,
      default: 0,
    },
    targetIndustryPartnership: {
      type: [String],
      default: [],
      index: true,
    },
    preferredPartnerRepresentative: {
      type: String,
      default: '',
    },
    // Partnership field - separate from multimedia
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partnership',
      default: null,
    },
    // Multimedia files - separate array
    multimedia: [MultimediaSchema],
    // Localization support
    localizations: {
      type: Map,
      of: LocalizationSchema,
      default: () => new Map(),
    },
    // Status fields
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
    },
    isPrivate: {
      type: Boolean,
      default: false,
      index: true,
    },
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

// Calculate academic year and semester
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

// Add method to update status based on dates and return if it changed
CourseSchema.methods.updateStatus = function(this: ICourseDocument): boolean {
  const isCompleted = !this.isActive && new Date() > this.endDate;
  const newStatus = determineItemStatus(this.startDate, this.endDate, isCompleted);
  
  if (this.status !== newStatus) {
    this.status = newStatus;
    return true; 
  }
  
  return false;
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

    // Calculate academic year and semester
    this.setAcademicYearAndSemester();
    
    // Update status
    this.updateStatus();
    
    next();
  } catch (error) {
    next(error instanceof Error ? error : new Error(String(error)));
  }
});

// Create compound indexes for efficient queries
CourseSchema.index({ creatorUserId: 1, level: 1 });
CourseSchema.index({ academicYear: 1, semester: 1 });
CourseSchema.index({ startDate: 1, endDate: 1 });
CourseSchema.index({ country: 1, level: 1 });
CourseSchema.index({ status: 1, isActive: 1 });
CourseSchema.index({ organisation: 1, country: 1 });
CourseSchema.index({ name: 'text', code: 'text', description: 'text' }); // Text search index

// Create and export the model with proper type information
export const Course = mongoose.model<ICourseDocument, ICourseModel>('Course', CourseSchema);

// Re-export the interface for use in other files
export type ICourse = ICourseDocument;
