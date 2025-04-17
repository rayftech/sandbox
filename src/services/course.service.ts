// src/services/course.service.ts
import mongoose from 'mongoose';
import { Course, ICourse, CourseLevel, IContentBlock } from '../models/course.model';
import { User, IUser } from '../models/user.model';
import { createLogger } from '../config/logger';
import { ItemLifecycleStatus } from '../models/status.enum';
import { EventPublisher } from './event.publisher';
import { EventType } from '../models/events.model';

const logger = createLogger('CourseService');

/**
 * Interface for multimedia file in a course
 */
export interface IMultimediaFile {
  fileId: string;
  type: 'image' | 'file' | 'video' | 'audio';
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

/**
 * Interface for localization content in the service layer
 * Allows both string and IContentBlock[] for backward compatibility
 */
export interface ILocalizationContent {
  name: string;
  description: string | IContentBlock[];  // Description in plain text or rich text format
  targetIndustryPartnership: string | string[];
  preferredPartnerRepresentative: string;
}

/**
 * Process localization content to ensure it uses IContentBlock[] format
 */
function processLocalizationContent(content: ILocalizationContent): any {
  const processed: any = {
    name: content.name,
    targetIndustryPartnership: content.targetIndustryPartnership,
    preferredPartnerRepresentative: content.preferredPartnerRepresentative
  };
  
  // Convert description to rich text format if it's a string
  if (typeof content.description === 'string') {
    processed.description = [{
      type: 'paragraph',
      children: [{ text: content.description }]
    }];
  } else {
    processed.description = content.description;
  }
  
  return processed;
}

/**
 * Interface for course creation data
 */
export interface ICourseCreationData {
  creatorUserId: string;                  // Amplify userId of creator
  name: string;                           // Name of the course
  code: string;                           // Course code
  level: CourseLevel;                     // Course level (for matching)
  startDate: Date;                        // Start date
  endDate: Date;                          // End date
  country: string;                        // Country
  organisation?: string;                  // Academic organisation
  description?: string | IContentBlock[];  // Course description (string for backward compatibility or rich text)
  expectedEnrollment?: number;            // Expected enrollment
  assessmentRedesign?: string | IContentBlock[]; // Assessment redesign info (string for backward compatibility or rich text)
  targetIndustryPartnership?: string[] | string;  // Target industry fields
  preferredPartnerRepresentative?: string; // Preferred partner
  multimedia?: IMultimediaFile[];         // Multimedia files
  localizations?: Map<string, ILocalizationContent> | Record<string, ILocalizationContent>; // Localized content
  partnerId?: mongoose.Types.ObjectId;    // Partnership ID
  isPrivate?: boolean;                    // If true, course is only visible to its owner
}

/**
 * Interface for course update data
 */
export interface ICourseUpdateData {
  name?: string;                           // Name of the course
  code?: string;                           // Course code
  level?: CourseLevel;                     // Course level (for matching)
  startDate?: Date;                        // Start date
  endDate?: Date;                          // End date
  country?: string;                        // Country
  organisation?: string;                   // Academic organisation
  isActive?: boolean;                      // Active status
  status?: ItemLifecycleStatus;            // Lifecycle status
  isPrivate?: boolean;                     // If true, course is only visible to its owner
  description?: string | IContentBlock[];   // Course description (string or rich text)
  expectedEnrollment?: number;             // Expected enrollment
  assessmentRedesign?: string | IContentBlock[]; // Assessment redesign info (string or rich text)
  targetIndustryPartnership?: string[] | string;  // Target industry fields
  preferredPartnerRepresentative?: string; // Preferred partner
  multimedia?: IMultimediaFile[];          // Multimedia files to add
  removeMultimedia?: string[];             // File IDs to remove
  localizations?: Map<string, ILocalizationContent> | Record<string, ILocalizationContent>; // Localized content
  partnerId?: mongoose.Types.ObjectId;     // Partnership ID
}

/**
 * Course service class for managing course operations
 * Implements core business logic for course-related functionality
 * Uses MongoDB as the single source of truth
 */
export class CourseService {
  private static eventPublisher = EventPublisher.getInstance();

  /**
   * Checks all active courses to determine if they have ended based on end date
   * Updates status and sends notifications for courses that have passed their end date
   * @returns Promise with results of the check operation
   */
  static async checkCoursesEndDate(): Promise<{ updated: number, errors: number }> {
    try {
      logger.info('Starting course end date check');
      const now = new Date();
      
      // Find all active courses where end date has passed
      const expiredCourses = await Course.find({
        isActive: true,
        endDate: { $lt: now }
      });
      
      logger.info(`Found ${expiredCourses.length} expired courses that need status update`);
      
      let updated = 0;
      let errors = 0;
      
      // Process each expired course
      for (const course of expiredCourses) {
        try {
          // Update course status
          course.isActive = false;
          course.updateStatus();
          
          // Save the updated course
          await course.save();
          updated++;
          
          // Send notification event
          await this.eventPublisher.publishCourseEvent(
            EventType.COURSE_UPDATED,
            {
              courseId: course._id.toString(),
              name: course.name,
              code: course.code,
              level: course.level,
              creatorUserId: course.creatorUserId,
              startDate: course.startDate,
              endDate: course.endDate
            }
          );
          
          // Send system notification to course creator
          await this.eventPublisher.publishSystemNotification({
            recipientUserId: course.creatorUserId,
            title: 'Course Ended',
            message: `Your course "${course.name}" (${course.code}) has reached its end date and has been marked as completed.`,
            priority: 'medium'
          });
          
          logger.info(`Updated status for expired course ${course._id}, "${course.name}" (${course.code})`);
        } catch (courseError) {
          errors++;
          logger.error(`Error updating expired course ${course._id}: ${courseError instanceof Error ? courseError.message : String(courseError)}`);
        }
      }
      
      logger.info(`Course end date check completed. Updated: ${updated}, Errors: ${errors}`);
      return { updated, errors };
    } catch (error) {
      logger.error(`Error in checkCoursesEndDate: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }


  /**
   * Create a new course in MongoDB with all course data stored directly
   * 
   * @param courseData The course data
   * @returns The created course document
   */
  static async createCourse(courseData: ICourseCreationData): Promise<ICourse> {
    
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validate date range
      if (courseData.endDate <= courseData.startDate) {
        throw new Error('End date must be after start date');
      }
      if (typeof courseData.startDate === 'string') {
        courseData.startDate = new Date(courseData.startDate);
      }
      if (typeof courseData.endDate === 'string') {
        courseData.endDate = new Date(courseData.endDate);
      }

      // Verify user exists
      const user = await User.findOne({ userId: courseData.creatorUserId });
      if (!user) {
        throw new Error(`Creator with userId ${courseData.creatorUserId} not found`);
      }
      
      // Check for duplicate course (same user and course name)
      const existingCourse = await Course.findOne({
        creatorUserId: courseData.creatorUserId,
        name: { $regex: new RegExp(`^${courseData.name}$`, 'i') } // Case-insensitive match
      });
      
      if (existingCourse) {
        throw new Error(`A course with the name "${courseData.name}" already exists for this user`);
      }

      // Prepare the course data
      const courseModelData: any = {
        creatorUserId: courseData.creatorUserId,
        name: courseData.name,
        code: courseData.code,
        level: courseData.level,
        startDate: courseData.startDate,
        endDate: courseData.endDate,
        country: courseData.country || 'Unknown',
        organisation: courseData.organisation || '',
        isActive: true,
        isPrivate: courseData.isPrivate || false,
        status: ItemLifecycleStatus.UPCOMING // Will be updated by pre-save middleware
      };

      // Add extended fields if provided
      if (courseData.description) {
        // Handle either string or IContentBlock[] type
        if (typeof courseData.description === 'string') {
          // Convert plain string to rich text format if needed
          courseModelData.description = [{
            type: 'paragraph',
            children: [{ text: courseData.description }]
          }];
        } else {
          // It's already in rich text format
          courseModelData.description = courseData.description;
        }
      }

      if (courseData.assessmentRedesign) {
        // Handle either string or IContentBlock[] type
        if (typeof courseData.assessmentRedesign === 'string') {
          // Convert plain string to rich text format if needed
          courseModelData.assessmentRedesign = [{
            type: 'paragraph',
            children: [{ text: courseData.assessmentRedesign }]
          }];
        } else {
          // It's already in rich text format
          courseModelData.assessmentRedesign = courseData.assessmentRedesign;
        }
      }

      if (courseData.expectedEnrollment) {
        courseModelData.expectedEnrollment = courseData.expectedEnrollment;
      }

      if (courseData.targetIndustryPartnership) {
        const validatedPartnerships = this.validateIndustryPartnership(
          courseData.targetIndustryPartnership
        );
        if (validatedPartnerships.length > 0) {
          courseModelData.targetIndustryPartnership = validatedPartnerships;
        }
      }

      if (courseData.preferredPartnerRepresentative) {
        courseModelData.preferredPartnerRepresentative = courseData.preferredPartnerRepresentative;
      }

      // Add multimedia files if provided
      if (courseData.multimedia && courseData.multimedia.length > 0) {
        courseModelData.multimedia = courseData.multimedia;
      }

      // Add partner ID if provided
      if (courseData.partnerId) {
        courseModelData.partnerId = courseData.partnerId;
      }

      // Add localizations if provided
      if (courseData.localizations) {
        // Process localizations and convert to proper format
        const processedLocalizations = new Map();
        
        if (!(courseData.localizations instanceof Map)) {
          // If it's a Record/Object
          for (const [locale, content] of Object.entries(courseData.localizations)) {
            processedLocalizations.set(locale, processLocalizationContent(content));
          }
        } else {
          // If it's already a Map
          courseData.localizations.forEach((content, locale) => {
            processedLocalizations.set(locale, processLocalizationContent(content));
          });
        }
        
        courseModelData.localizations = processedLocalizations;
      }

      // Create and prepare the course instance
      const course = new Course(courseModelData);

      // Calculate academic year and semester
      course.setAcademicYearAndSemester();
      
      // Ensure status is set correctly based on dates
      course.updateStatus();

      // Save the course in MongoDB
      const savedCourse = await course.save({ session });

      // Increment user course count metric
      await CourseService.incrementUserMetric(
        courseData.creatorUserId,
        'totalCoursesCreated',
        1,
        session
      );

      // Publish course creation event
      try {
        await this.eventPublisher.publishCourseEvent(
          EventType.COURSE_CREATED,
          {
            courseId: savedCourse._id.toString(),
            name: savedCourse.name,
            code: savedCourse.code,
            level: savedCourse.level,
            creatorUserId: courseData.creatorUserId,
            startDate: savedCourse.startDate,
            endDate: savedCourse.endDate
          }
        );
        logger.info(`Published COURSE_CREATED event for course ${savedCourse._id}`);
      } catch (eventError) {
        logger.error(`Error publishing course creation event: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
        // Continue with transaction even if event publishing fails
      }

      await session.commitTransaction();
      logger.info(`New course created in MongoDB: ${savedCourse._id} by user ${courseData.creatorUserId} from ${courseData.country || 'unknown'}, organisation: ${courseData.organisation || 'not specified'}`);

      return savedCourse;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error creating course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Process industry partnership strings into an array
  private static validateIndustryPartnership(partnership?: string | string[]): string[] {
    // If no partnership provided, return empty array
    if (!partnership) {
      return [];
    }
    
    // If string is provided, convert to array
    if (typeof partnership === 'string') {
      // Split by comma and trim whitespace
      return partnership
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }
    
    // If array is provided, just filter out empty strings
    if (Array.isArray(partnership)) {
      return partnership
        .filter(item => typeof item === 'string' && item.trim().length > 0)
        .map(item => item.trim());
    }
    
    return [];
  }

  /**
   * Update a course
   * @param courseId The MongoDB ID of the course
   * @param updateData The data to update
   * @param userId The userId of the user making the update (for permission check)
   * @returns The updated course document
   */
  static async updateCourse(
    courseId: string, 
    updateData: ICourseUpdateData, 
    userId: string
  ): Promise<ICourse> {
    try {
      if (!mongoose.isValidObjectId(courseId)) {
        throw new Error('Invalid course ID format');
      }
      
      // Get the course to update
      const course = await Course.findById(courseId);
      
      if (!course) {
        throw new Error(`Course with ID ${courseId} not found`);
      }

      // Check if user is the creator or an admin
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Verify the user has permission to update this course
      if (course.creatorUserId !== userId && !user.isAdmin) {
        throw new Error('Permission denied: Only course creator or admin can update this course');
      }

      // Validate date range if both dates are provided
      if (updateData.startDate && updateData.endDate && 
          updateData.endDate <= updateData.startDate) {
        throw new Error('End date must be after start date');
      }
      
      // If only one date is provided, check against existing date
      if (updateData.startDate && !updateData.endDate && 
          updateData.startDate >= course.endDate) {
        throw new Error('Start date must be before existing end date');
      }
      
      if (!updateData.startDate && updateData.endDate && 
          updateData.endDate <= course.startDate) {
        throw new Error('End date must be after existing start date');
      }

      // Extract base fields for the update - only include what was provided
      const courseUpdateData: Partial<ICourse> = {};
      
      // Only set fields that were provided in the update
      if (updateData.name !== undefined) courseUpdateData.name = updateData.name;
      if (updateData.code !== undefined) courseUpdateData.code = updateData.code;
      if (updateData.level !== undefined) courseUpdateData.level = updateData.level;
      if (updateData.startDate !== undefined) courseUpdateData.startDate = updateData.startDate;
      if (updateData.endDate !== undefined) courseUpdateData.endDate = updateData.endDate;
      if (updateData.country !== undefined) courseUpdateData.country = updateData.country;
      if (updateData.organisation !== undefined) courseUpdateData.organisation = updateData.organisation;
      if (updateData.isActive !== undefined) courseUpdateData.isActive = updateData.isActive;
      if (updateData.isPrivate !== undefined) courseUpdateData.isPrivate = updateData.isPrivate;

      // Add enhanced fields if provided
      if (updateData.description !== undefined) {
        // Handle either string or IContentBlock[] type
        if (typeof updateData.description === 'string') {
          // Convert plain string to rich text format
          courseUpdateData.description = [{
            type: 'paragraph',
            children: [{ text: updateData.description }]
          }];
        } else {
          // It's already in rich text format
          courseUpdateData.description = updateData.description;
        }
      }

      if (updateData.assessmentRedesign !== undefined) {
        // Handle either string or IContentBlock[] type
        if (typeof updateData.assessmentRedesign === 'string') {
          // Convert plain string to rich text format
          courseUpdateData.assessmentRedesign = [{
            type: 'paragraph',
            children: [{ text: updateData.assessmentRedesign }]
          }];
        } else {
          // It's already in rich text format
          courseUpdateData.assessmentRedesign = updateData.assessmentRedesign;
        }
      }

      if (updateData.expectedEnrollment !== undefined) {
        courseUpdateData.expectedEnrollment = updateData.expectedEnrollment;
      }

      if (updateData.targetIndustryPartnership !== undefined) {
        const validatedPartnerships = this.validateIndustryPartnership(updateData.targetIndustryPartnership);
        courseUpdateData.targetIndustryPartnership = validatedPartnerships; // Always set, even if empty
      }

      if (updateData.preferredPartnerRepresentative !== undefined) {
        courseUpdateData.preferredPartnerRepresentative = updateData.preferredPartnerRepresentative;
      }

      if (updateData.partnerId !== undefined) {
        courseUpdateData.partnerId = updateData.partnerId;
      }

      // Handle multimedia updates if provided
      if (updateData.multimedia && updateData.multimedia.length > 0) {
        // Initialize multimedia array if it doesn't exist
        if (!course.multimedia) {
          course.multimedia = [];
        }
        
        // Validate and add new multimedia files
        const validMultimedia = updateData.multimedia.map(media => {
          // Ensure type is one of the allowed values
          const validType = ['image', 'file', 'video', 'audio'].includes(media.type) 
            ? media.type 
            : 'file'; // Default to 'file' if invalid type provided
          
          return {
            ...media,
            type: validType
          };
        });
        
        // Add validated multimedia files
        course.multimedia.push(...validMultimedia);
      }

      // Handle multimedia removal if specified
      if (updateData.removeMultimedia && updateData.removeMultimedia.length > 0) {
        if (course.multimedia && course.multimedia.length > 0) {
          // Filter out multimedia files to be removed
          course.multimedia = course.multimedia.filter(
            file => !updateData.removeMultimedia!.includes(file.fileId)
          );
        }
      }

      // Handle localizations if provided
      if (updateData.localizations) {
        // Initialize localizations if not exists
        if (!course.localizations) {
          course.localizations = new Map();
        }
        
        // Convert from Record to entries if needed and update the map
        if (!(updateData.localizations instanceof Map)) {
          for (const [locale, content] of Object.entries(updateData.localizations)) {
            course.localizations.set(locale, processLocalizationContent(content));
          }
        } else {
          // Merge Map entries
          updateData.localizations.forEach((content, locale) => {
            course.localizations.set(locale, processLocalizationContent(content));
          });
        }
      }

      // Apply updates to the course object
      Object.assign(course, courseUpdateData);
      
      // Recalculate academic year and semester if dates changed
      if (updateData.startDate) {
        course.setAcademicYearAndSemester();
      }
      
      // Update status based on new dates if provided
      if (updateData.startDate || updateData.endDate || updateData.isActive !== undefined) {
        course.updateStatus();
      }

      // Save the updated course
      const updatedCourse = await course.save();

      // Publish course update event
      try {
        await this.eventPublisher.publishCourseEvent(
          EventType.COURSE_UPDATED,
          {
            courseId: updatedCourse._id.toString(),
            name: updatedCourse.name,
            code: updatedCourse.code,
            level: updatedCourse.level,
            creatorUserId: updatedCourse.creatorUserId,
            startDate: updatedCourse.startDate,
            endDate: updatedCourse.endDate
          }
        );
        logger.info(`Published COURSE_UPDATED event for course ${updatedCourse._id}`);
      } catch (eventError) {
        logger.error(`Error publishing course update event: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
      }

      logger.info(`Course ${courseId} updated by user ${userId}${updateData.country ? `, country set to: ${updateData.country}` : ''}${updateData.organisation ? `, organisation set to: ${updateData.organisation}` : ''}`);
      return updatedCourse;
    } catch (error) {
      logger.error(`Error updating course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get a course by its ID
   * @param courseId The MongoDB ID of the course
   * @param requesterId Optional userId of the requester (to check permission for private courses)
   * @returns The course document or null if not found
   */
  static async getCourseById(courseId: string, requesterId?: string): Promise<ICourse | null> {
    try {
      if (!mongoose.isValidObjectId(courseId)) {
        throw new Error('Invalid course ID format');
      }
      
      // Get course from MongoDB with all its data
      const course = await Course.findById(courseId);
      
      if (!course) {
        logger.warn(`Course with ID ${courseId} not found`);
        return null;
      }
      
      // Check if course is private and requester is not the owner
      if (course.isPrivate && requesterId && course.creatorUserId !== requesterId) {
        // Check if requester is admin
        const user = await User.findOne({ userId: requesterId });
        if (!user?.isAdmin) {
          logger.warn(`Access to private course ${courseId} denied for user ${requesterId}`);
          return null;
        }
      }
      
      return course;
    } catch (error) {
      logger.error(`Error getting course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get creator user details
   * @param userId The userId of the course creator
   * @returns The user details or null if not found
   */
  static async getCreatorDetails(userId: string): Promise<IUser | null> {
    try {
      if (!userId) {
        logger.warn('No userId provided to getCreatorDetails');
        return null;
      }
      
      // Get user from MongoDB with required fields
      const user = await User.findOne(
        { userId },
        { prefix: 1, firstName: 1, lastName: 1, email: 1, organisation: 1 }
      );
      
      if (!user) {
        logger.warn(`User with userId ${userId} not found`);
        return null;
      }
      
      return user;
    } catch (error) {
      logger.error(`Error getting creator details: ${error instanceof Error ? error.message : String(error)}`);
      return null; // Return null instead of throwing to prevent course fetch from failing
    }
  }

  // Rest of your existing methods remain unchanged
  
  // Exposing private methods for testing
  static async _hasActivePartnerships(courseId: string): Promise<boolean> {
    return CourseService.hasActivePartnerships(courseId);
  }

  /**
   * Check if a course has any active partnerships
   * @param courseId The MongoDB ID of the course
   * @returns Boolean indicating if the course has active partnerships
   */
  private static async hasActivePartnerships(courseId: string): Promise<boolean> {
    try {
      // Check if Partnership model exists in mongoose models
      if (mongoose.models.Partnership) {
        const Partnership = mongoose.model('Partnership');
        const activePartnership = await Partnership.findOne({
          courseId: new mongoose.Types.ObjectId(courseId),
          status: 'approved'
        });
        
        return !!activePartnership;
      } else {
        // If Partnership model is not registered yet, return false
        logger.warn(`Partnership model not found when checking course ${courseId} partnerships`);
        return false;
      }
    } catch (error) {
      logger.warn(`Error checking partnerships for course ${courseId}: ${error instanceof Error ? error.message : String(error)}`);
      // In case of error, return false to allow operation to continue
      return false;
    }
  }

  /**
   * Increment analytics metrics for a user
   * @param userId The userId of the user
   * @param field The field to increment
   * @param amount The amount to increment by (default: 1)
   * @param session Optional Mongoose session for transactions
   * @returns The updated user document
   */
  private static async incrementUserMetric(
    userId: string,
    field: 'totalCoursesCreated' | 'totalProjectsCreated' | 'totalPartnershipsInitiated' | 'totalPartnershipsReceived',
    amount: number = 1,
    session?: mongoose.ClientSession
  ): Promise<IUser> {
    try {
      const updateQuery: Record<string, any> = {};
      updateQuery[field] = amount;
      
      const options = session ? { session, new: true } : { new: true };
      
      const user = await User.findOneAndUpdate(
        { userId },
        { $inc: updateQuery },
        options
      );
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      logger.info(`Incremented ${field} by ${amount} for user ${userId}`);
      return user;
    } catch (error) {
      logger.error(`Error incrementing metric: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get courses by organisation
   * @param organisation The organisation name to filter by
   * @returns Array of matching course documents
   */
  static async getCoursesByOrganisation(organisation: string): Promise<ICourse[]> {
    try {
      return await Course.find({ organisation })
        .sort({ createdAt: -1 });
    } catch (error) {
      logger.error(`Error getting courses by organisation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get courses by country
   * @param country The country name to filter by
   * @returns Array of matching course documents
   */
  static async getCoursesByCountry(country: string): Promise<ICourse[]> {
    try {
      return await Course.find({ country })
        .sort({ createdAt: -1 });
    } catch (error) {
      logger.error(`Error getting courses by country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get courses grouped by local country and overseas
   * @param userCountry The country of the requesting user
   * @param requesterId Optional userId of the requester (to filter private courses)
   * @returns Object with local and overseas courses
   */
  static async getCoursesByUserCountry(
    userCountry: string,
    requesterId?: string
  ): Promise<{ local: ICourse[], overseas: ICourse[] }> {
    try {
      // Define query to handle private courses
      const query: any = {};
      
      // If requesterId is provided, adjust filters to handle private courses
      if (requesterId) {
        // Check if the requester is an admin
        const user = await User.findOne({ userId: requesterId });
        const isAdmin = user?.isAdmin || false;

        // If not admin, only show non-private courses or private courses owned by the requester
        if (!isAdmin) {
          query.$or = [
            { isPrivate: false },
            { isPrivate: true, creatorUserId: requesterId }
          ];
        }
      } else {
        // If no requesterId, only show non-private courses
        query.isPrivate = false;
      }
      
      // Get all accessible courses sorted by creation date
      const courses = await Course.find(query)
        .sort({ createdAt: -1 });
      
      // Group courses into local and overseas
      const local = courses.filter(course => course.country === userCountry);
      const overseas = courses.filter(course => course.country !== userCountry);
      
      logger.info(`Grouped courses by user country ${userCountry}: ${local.length} local, ${overseas.length} overseas`);
      
      return { local, overseas };
    } catch (error) {
      logger.error(`Error grouping courses by user country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Search courses
   * @param query Search query
   * @param limit Maximum number of results
   * @param filters Additional filters to apply (country, organisation, etc.)
   * @param requesterId Optional userId of the requester (to filter private courses)
   * @returns Array of matching course documents
   */
  static async searchCourses(query: string, limit: number = 10, filters: any = {}, requesterId?: string): Promise<ICourse[]> {
    try {
      // Create text index if it doesn't exist yet
      const collection = Course.collection;
      const indexes = await collection.indexes();
      
      const hasTextIndex = indexes.some(index => 
        index.name === 'name_text_code_text'
      );
      
      if (!hasTextIndex) {
        await collection.createIndex({ 
          name: 'text', 
          code: 'text',
          organisation: 'text',
          country: 'text'
        });
      }

      // Create a copy of the filters to avoid modifying the original
      const queryFilters = { ...filters };

      // Combine text search with additional filters
      const searchQuery: any = {
        $text: { $search: query }
      };
      
      // Add any additional filters
      Object.keys(queryFilters).forEach(key => {
        if (queryFilters[key]) {
          searchQuery[key] = queryFilters[key];
        }
      });

      // Handle private courses based on requester
      if (requesterId) {
        // Check if the requester is an admin
        const user = await User.findOne({ userId: requesterId });
        const isAdmin = user?.isAdmin || false;

        // If not admin, only show non-private courses or private courses owned by the requester
        if (!isAdmin) {
          searchQuery.$or = [
            { isPrivate: false },
            { isPrivate: true, creatorUserId: requesterId }
          ];
        }
      } else {
        // If no requesterId, only show non-private courses
        searchQuery.isPrivate = false;
      }

      // Perform search with combined query
      const courses = await Course.find(searchQuery, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit);
      
      logger.info(`Search executed with query "${query}" and filters ${JSON.stringify(filters)}, found ${courses.length} results`);
      
      return courses;
    } catch (error) {
      logger.error(`Error searching courses: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get course statistics by organisation
   * @returns Array of statistical groupings by organisation
   */
  static async getCourseStatsByOrganisation(): Promise<any[]> {
    try {
      return await Course.aggregate([
        {
          $match: {
            organisation: { $exists: true, $ne: '' }
          }
        },
        {
          $group: {
            _id: { organisation: '$organisation' },
            count: { $sum: 1 },
            organisations: { $addToSet: '$organisation' }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);
    } catch (error) {
      logger.error(`Error getting course statistics by organisation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get courses with pagination
   * @param page The page number (1-based)
   * @param limit The number of items per page
   * @param filters Additional filters to apply
   * @param requesterId Optional userId of the requester (to filter private courses)
   * @returns Object containing paginated results and metadata
   */
  static async getPaginatedCourses(
    page: number = 1,
    limit: number = 10,
    filters: any = {},
    requesterId?: string
  ): Promise<{ courses: ICourse[], total: number, pages: number }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;

      // Create a copy of the filters to avoid modifying the original
      const queryFilters = { ...filters };

      // If requesterId is provided, adjust filters to handle private courses
      if (requesterId) {
        // Check if the requester is an admin
        const user = await User.findOne({ userId: requesterId });
        const isAdmin = user?.isAdmin || false;

        // If not admin, only show non-private courses or private courses owned by the requester
        if (!isAdmin) {
          queryFilters.$or = [
            { isPrivate: false },
            { isPrivate: true, creatorUserId: requesterId }
          ];
        }
      } else {
        // If no requesterId, only show non-private courses
        queryFilters.isPrivate = false;
      }

      // Log the filters being applied
      logger.debug(`Getting paginated courses with filters: ${JSON.stringify(queryFilters)}`);

      // Count total matching documents for pagination metadata
      const total = await Course.countDocuments(queryFilters);
      
      // Get the paginated results
      const courses = await Course.find(queryFilters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit);

      // Calculate total pages
      const pages = Math.ceil(total / validLimit);

      return {
        courses,
        total,
        pages
      };
    } catch (error) {
      logger.error(`Error getting paginated courses: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get courses list with pagination and only the requested fields
   * @param page The page number (1-based)
   * @param limit The number of items per page
   * @param requesterId Optional userId of the requester (to filter private courses)
   * @returns Object containing paginated course list with selected fields and metadata
   */
  static async getPaginatedCoursesList(
    page: number = 1,
    limit: number = 10,
    requesterId?: string
  ): Promise<{ courses: any[], total: number, pages: number }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;

      // Create query filters to handle private courses
      const queryFilters: any = {};

      // If requesterId is provided, adjust filters to handle private courses
      if (requesterId) {
        // Check if the requester is an admin
        const user = await User.findOne({ userId: requesterId });
        const isAdmin = user?.isAdmin || false;

        // If not admin, only show non-private courses or private courses owned by the requester
        if (!isAdmin) {
          queryFilters.$or = [
            { isPrivate: false },
            { isPrivate: true, creatorUserId: requesterId }
          ];
        }
      } else {
        // If no requesterId, only show non-private courses
        queryFilters.isPrivate = false;
      }

      // Count total documents for pagination metadata
      const total = await Course.countDocuments(queryFilters);
      
      // Get the paginated results with only the specified fields
      const courses = await Course.find(queryFilters, {
        _id: 1,           // MongoDB ID
        name: 1,          // Course name
        code: 1,          // Course code
        level: 1,         // Course level
        startDate: 1,     // Start date
        endDate: 1,       // End date
        status: 1,        // Status
        organisation: 1,  // Organisation
        targetIndustryPartnership: 1, // Target industry partnership
        description: 1,   // Description
        isPrivate: 1      // Is private flag
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit);

      // Calculate total pages
      const pages = Math.ceil(total / validLimit);

      // Transform the results to ensure ID field is correctly formatted
      const formattedCourses = courses.map(course => {
        const courseObj = course.toObject();
        // Create a new object with the fields we want, using destructuring and renaming
        const { 
          _id, name, code, level, startDate, endDate, status, 
          organisation, targetIndustryPartnership, description, isPrivate 
        } = courseObj;
        return {
          id: _id,
          name,
          code,
          level,
          startDate,
          endDate,
          status,
          organisation,
          targetIndustryPartnership,
          description,
          isPrivate
        };
      });

      logger.info(`Retrieved paginated courses list: ${formattedCourses.length} courses on page ${validPage} of ${pages}`);
      
      return {
        courses: formattedCourses,
        total,
        pages
      };
    } catch (error) {
      logger.error(`Error getting paginated courses list: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get filtered courses with pagination and selected fields
   * @param page The page number (1-based)
   * @param limit The number of items per page
   * @param filters Object containing filter criteria (level, country, organisation, etc.)
   * @param requesterId Optional userId of the requester (to filter private courses)
   * @param groupByUserCountry If true, group results by user's country vs overseas
   * @param userCountry The user's country (required if groupByUserCountry is true)
   * @returns Object containing filtered course list with selected fields and metadata
   */
  static async getFilteredCoursesList(
    page: number = 1,
    limit: number = 10,
    filters: Record<string, any> = {},
    requesterId?: string,
    groupByUserCountry: boolean = false,
    userCountry?: string
  ): Promise<{ 
    courses: any[], 
    total: number, 
    pages: number,
    groupedCourses?: { local: any[], overseas: any[] } 
  }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;

      // Create a copy of the filters to avoid modifying the original
      const queryFilters = { ...filters };

      // If requesterId is provided, adjust filters to handle private courses
      if (requesterId) {
        // Check if the requester is an admin
        const user = await User.findOne({ userId: requesterId });
        const isAdmin = user?.isAdmin || false;

        // If not admin, only show non-private courses or private courses owned by the requester
        if (!isAdmin) {
          queryFilters.$or = [
            { isPrivate: false },
            { isPrivate: true, creatorUserId: requesterId }
          ];
        }
      } else {
        // If no requesterId, only show non-private courses
        queryFilters.isPrivate = false;
      }

      // Log the filters being applied
      logger.debug(`Getting filtered courses with filters: ${JSON.stringify(queryFilters)}`);

      // Count total matching documents for pagination metadata
      const total = await Course.countDocuments(queryFilters);
      
      // Get the filtered results with only the specified fields
      const courses = await Course.find(queryFilters, {
        _id: 1,           // MongoDB ID
        name: 1,          // Course name
        code: 1,          // Course code
        level: 1,         // Course level
        startDate: 1,     // Start date
        endDate: 1,       // End date
        status: 1,        // Status
        organisation: 1,  // Organisation
        country: 1,       // Country
        targetIndustryPartnership: 1, // Target industry partnership
        description: 1,   // Description
        isPrivate: 1      // Is private flag
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit);

      // Calculate total pages
      const pages = Math.ceil(total / validLimit);

      // Transform the results to ensure ID field is correctly formatted
      const formattedCourses = courses.map(course => {
        const courseObj = course.toObject();
        // Create a new object with the fields we want, using destructuring and renaming
        const { 
          _id, 
          name, 
          code, 
          level,
          startDate, 
          endDate, 
          status, 
          organisation,
          country, 
          targetIndustryPartnership, 
          description,
          isPrivate
        } = courseObj;
        
        return {
          id: _id,
          name,
          code,
          level,
          startDate,
          endDate,
          status,
          organisation,
          country,
          targetIndustryPartnership,
          description,
          isPrivate
        };
      });

      // Group by user country if requested and user country is provided
      let groupedCourses;
      if (groupByUserCountry && userCountry) {
        // Group courses into local and overseas
        const local = formattedCourses.filter(course => course.country === userCountry);
        const overseas = formattedCourses.filter(course => course.country !== userCountry);
        
        groupedCourses = { local, overseas };
        
        logger.info(`Grouped filtered courses by user country ${userCountry}: ${local.length} local, ${overseas.length} overseas`);
      }

      const filterDescription = Object.keys(filters).length > 0 
        ? `with filters: ${JSON.stringify(filters)}` 
        : 'with no filters';
        
      logger.info(`Retrieved filtered courses ${filterDescription}: ${formattedCourses.length} courses on page ${validPage} of ${pages}`);
      
      return {
        courses: formattedCourses,
        total,
        pages,
        ...(groupedCourses && { groupedCourses })
      };
    } catch (error) {
      logger.error(`Error getting filtered courses list: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Delete a course
   * @param courseId The MongoDB ID of the course
   * @param userId The userId of the user making the delete request (for permission check)
   * @returns Boolean indicating success
   */
  static async deleteCourse(courseId: string, userId: string): Promise<boolean> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (!mongoose.isValidObjectId(courseId)) {
        throw new Error('Invalid course ID format');
      }
      
      // Get the course to delete
      const course = await Course.findById(courseId);
      
      if (!course) {
        throw new Error(`Course with ID ${courseId} not found`);
      }

      // Check if user is the creator or an admin
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Verify the user has permission to delete this course
      if (course.creatorUserId !== userId && !user.isAdmin) {
        throw new Error('Permission denied: Only course creator or admin can delete this course');
      }

      // Check if the course is part of any active partnerships
      const hasActivePartnerships = await CourseService.hasActivePartnerships(courseId);
      
      if (hasActivePartnerships) {
        throw new Error('Cannot delete course with active partnerships');
      }

      // Delete the course
      await Course.findByIdAndDelete(courseId, { session });

      // Decrement the user's course count
      await CourseService.incrementUserMetric(
        course.creatorUserId,
        'totalCoursesCreated',
        -1,
        session
      );

      await session.commitTransaction();
      logger.info(`Course ${courseId} deleted by user ${userId}`);
      return true;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error deleting course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Set a course's active status
   * @param courseId The MongoDB ID of the course
   * @param isActive The new active status
   * @param userId The userId of the user making the update (for permission check)
   * @returns The updated course document
   */
  static async setCourseActiveStatus(
    courseId: string,
    isActive: boolean,
    userId: string
  ): Promise<ICourse> {
    try {
      // Reuse the update method for this operation
      return await CourseService.updateCourse(
        courseId,
        { isActive },
        userId
      );
    } catch (error) {
      logger.error(`Error updating course status: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get courses by creator
   * @param userId The user ID of the creator
   * @param requesterId Optional userId of the requester (to check permission for private courses)
   * @returns Array of course documents
   */
  static async getCoursesByCreator(userId: string, requesterId?: string): Promise<ICourse[]> {
    try {
      // Define query criteria
      const query: any = { creatorUserId: userId };
      
      // If the requester is not the creator and not an admin, only show non-private courses
      if (requesterId && requesterId !== userId) {
        // Check if requester is admin
        const user = await User.findOne({ userId: requesterId });
        if (!user?.isAdmin) {
          query.isPrivate = false;
        }
      } else if (!requesterId) {
        // If no requesterId, only show non-private courses
        query.isPrivate = false;
      }
      
      return await Course.find(query)
        .sort({ createdAt: -1 });
    } catch (error) {
      logger.error(`Error getting courses by creator: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get course statistics by academic period
   * @returns Array of statistical groupings by academic year and semester
   */
  static async getCourseStatsByAcademicPeriod(): Promise<any[]> {
    try {
      return await Course.aggregate([
        {
          $group: {
            _id: {
              academicYear: '$academicYear',
              semester: '$semester'
            },
            count: { $sum: 1 },
            courses: { $push: { id: '$_id', name: '$name', code: '$code' } }
          }
        },
        {
          $sort: { '_id.academicYear': -1, '_id.semester': 1 }
        }
      ]);
    } catch (error) {
      logger.error(`Error getting course statistics by academic period: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get course statistics by country
   * @returns Array of statistical groupings by country
   */
  static async getCourseStatsByCountry(): Promise<any[]> {
    try {
      return await Course.aggregate([
        {
          $match: {
            country: { $exists: true, $ne: '' }
          }
        },
        {
          $group: {
            _id: { country: '$country' },
            count: { $sum: 1 },
            countries: { $addToSet: '$country' }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);
    } catch (error) {
      logger.error(`Error getting course statistics by country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Add multimedia files to a course
   * @param courseId The MongoDB ID of the course
   * @param files The multimedia files to add
   * @param userId The userId of the user making the update
   * @returns The updated course document
   */
  static async addMultimediaFiles(
    courseId: string,
    files: IMultimediaFile[],
    userId: string
  ): Promise<ICourse> {
    try {
      if (!mongoose.isValidObjectId(courseId)) {
        throw new Error('Invalid course ID format');
      }

      if (!files || files.length === 0) {
        throw new Error('No files provided');
      }
      
      // Update the course and push new files to multimedia array
      const course = await Course.findById(courseId);
      
      if (!course) {
        throw new Error(`Course with ID ${courseId} not found`);
      }

      // Check if user is the creator or an admin
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Verify the user has permission to update this course
      if (course.creatorUserId !== userId && !user.isAdmin) {
        throw new Error('Permission denied: Only course creator or admin can add files to this course');
      }

      // Initialize multimedia array if it doesn't exist
      if (!course.multimedia) {
        course.multimedia = [];
      }
      
      // Add the new files
      course.multimedia.push(...files);
      
      // Save the updated course
      const updatedCourse = await course.save();
      
      logger.info(`Added ${files.length} multimedia files to course ${courseId} by user ${userId}`);
      
      return updatedCourse;
    } catch (error) {
      logger.error(`Error adding multimedia files: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Remove a multimedia file from a course
   * @param courseId The MongoDB ID of the course
   * @param fileId The file ID to remove
   * @param userId The userId of the user making the update
   * @returns The updated course document
   */
  static async removeMultimediaFile(
    courseId: string,
    fileId: string,
    userId: string
  ): Promise<ICourse> {
    try {
      if (!mongoose.isValidObjectId(courseId)) {
        throw new Error('Invalid course ID format');
      }

      if (!fileId) {
        throw new Error('No file ID provided');
      }
      
      // Get the course
      const course = await Course.findById(courseId);
      
      if (!course) {
        throw new Error(`Course with ID ${courseId} not found`);
      }

      // Check if user is the creator or an admin
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Verify the user has permission to update this course
      if (course.creatorUserId !== userId && !user.isAdmin) {
        throw new Error('Permission denied: Only course creator or admin can remove files from this course');
      }

      // Check if course has multimedia files
      if (!course.multimedia || course.multimedia.length === 0) {
        throw new Error('Course has no multimedia files');
      }
      
      // Find the file to remove
      const fileIndex = course.multimedia.findIndex(file => file.fileId === fileId);
      
      if (fileIndex === -1) {
        throw new Error(`File with ID ${fileId} not found in course`);
      }
      
      // Remove the file
      course.multimedia.splice(fileIndex, 1);
      
      // Save the updated course
      const updatedCourse = await course.save();
      
      logger.info(`Removed multimedia file ${fileId} from course ${courseId} by user ${userId}`);
      
      return updatedCourse;
    } catch (error) {
      logger.error(`Error removing multimedia file: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update a course's localizations
   * @param courseId The MongoDB ID of the course
   * @param localizations The localizations to update
   * @param userId The userId of the user making the update
   * @returns The updated course document
   */
  static async updateLocalizations(
    courseId: string,
    localizations: Record<string, ILocalizationContent>,
    userId: string
  ): Promise<ICourse> {
    try {
      if (!mongoose.isValidObjectId(courseId)) {
        throw new Error('Invalid course ID format');
      }

      if (!localizations || Object.keys(localizations).length === 0) {
        throw new Error('No localizations provided');
      }
      
      // Get the course
      const course = await Course.findById(courseId);
      
      if (!course) {
        throw new Error(`Course with ID ${courseId} not found`);
      }

      // Check if user is the creator or an admin
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Verify the user has permission to update this course
      if (course.creatorUserId !== userId && !user.isAdmin) {
        throw new Error('Permission denied: Only course creator or admin can update localizations for this course');
      }

      // Initialize localizations if not exists
      if (!course.localizations) {
        course.localizations = new Map();
      }
      
      // Update localizations
      for (const [locale, content] of Object.entries(localizations)) {
        course.localizations.set(locale, processLocalizationContent(content));
      }
      
      // Save the updated course
      const updatedCourse = await course.save();
      
      logger.info(`Updated localizations for course ${courseId} by user ${userId}`);
      
      return updatedCourse;
    } catch (error) {
      logger.error(`Error updating localizations: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}