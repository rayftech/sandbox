// src/services/course.service.ts
import mongoose from 'mongoose';
import { Course, ICourse, CourseLevel } from '../models/course.model';
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
 * Interface for localization content
 */
export interface ILocalizationContent {
  name: string;
  description: string;
  targetIndustryPartnership: string;
  preferredPartnerRepresentative: string;
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
  description?: string;                   // Course description
  expectedEnrollment?: number;            // Expected enrollment
  assessmentRedesign?: string;            // Assessment redesign info
  targetIndustryPartnership?: string[] | string;  // Target industry fields
  preferredPartnerRepresentative?: string; // Preferred partner
  multimedia?: IMultimediaFile[];         // Multimedia files
  localizations?: Map<string, ILocalizationContent> | Record<string, ILocalizationContent>; // Localized content
  partnerId?: mongoose.Types.ObjectId;    // Partnership ID
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
  description?: string;                    // Course description
  expectedEnrollment?: number;             // Expected enrollment
  assessmentRedesign?: string;             // Assessment redesign info
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
        status: ItemLifecycleStatus.UPCOMING // Will be updated by pre-save middleware
      };

      // Add extended fields if provided
      if (courseData.description) {
        courseModelData.description = courseData.description;
      }

      if (courseData.assessmentRedesign) {
        courseModelData.assessmentRedesign = courseData.assessmentRedesign;
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
        // Convert from Record to Map if needed
        if (!(courseData.localizations instanceof Map)) {
          courseModelData.localizations = new Map(
            Object.entries(courseData.localizations)
          );
        } else {
          courseModelData.localizations = courseData.localizations;
        }
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

      // Add enhanced fields if provided
      if (updateData.description !== undefined) {
        courseUpdateData.description = updateData.description;
      }

      if (updateData.assessmentRedesign !== undefined) {
        courseUpdateData.assessmentRedesign = updateData.assessmentRedesign;
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
            course.localizations.set(locale, content);
          }
        } else {
          // Merge Map entries
          updateData.localizations.forEach((content, locale) => {
            course.localizations.set(locale, content);
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
   * @returns The course document or null if not found
   */
  static async getCourseById(courseId: string): Promise<ICourse | null> {
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
      
      return course;
    } catch (error) {
      logger.error(`Error getting course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
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
   * Search courses
   * @param query Search query
   * @param limit Maximum number of results
   * @param filters Additional filters to apply (country, organisation, etc.)
   * @returns Array of matching course documents
   */
  static async searchCourses(query: string, limit: number = 10, filters: any = {}): Promise<ICourse[]> {
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

      // Combine text search with additional filters
      const searchQuery: any = {
        $text: { $search: query }
      };
      
      // Add any additional filters
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          searchQuery[key] = filters[key];
        }
      });

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
   * @returns Object containing paginated results and metadata
   */
  static async getPaginatedCourses(
    page: number = 1,
    limit: number = 10,
    filters: any = {}
  ): Promise<{ courses: ICourse[], total: number, pages: number }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;

      // Log the filters being applied
      logger.debug(`Getting paginated courses with filters: ${JSON.stringify(filters)}`);

      // Count total matching documents for pagination metadata
      const total = await Course.countDocuments(filters);
      
      // Get the paginated results
      const courses = await Course.find(filters)
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
   * @returns Object containing paginated course list with selected fields and metadata
   */
  static async getPaginatedCoursesList(
    page: number = 1,
    limit: number = 10
  ): Promise<{ courses: any[], total: number, pages: number }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;

      // Count total documents for pagination metadata
      const total = await Course.countDocuments();
      
      // Get the paginated results with only the specified fields
      const courses = await Course.find({}, {
        _id: 1,           // MongoDB ID
        name: 1,          // Course name
        code: 1,          // Course code
        startDate: 1,     // Start date
        endDate: 1,       // End date
        status: 1,        // Status
        organisation: 1,  // Organisation
        targetIndustryPartnership: 1, // Target industry partnership
        description: 1    // Description
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
        const { _id, name, code, startDate, endDate, status, organisation, targetIndustryPartnership, description } = courseObj;
        return {
          id: _id,
          name,
          code,
          startDate,
          endDate,
          status,
          organisation,
          targetIndustryPartnership,
          description
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
   * @returns Object containing filtered course list with selected fields and metadata
   */
  static async getFilteredCoursesList(
    page: number = 1,
    limit: number = 10,
    filters: Record<string, any> = {}
  ): Promise<{ courses: any[], total: number, pages: number }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;

      // Log the filters being applied
      logger.debug(`Getting filtered courses with filters: ${JSON.stringify(filters)}`);

      // Count total matching documents for pagination metadata
      const total = await Course.countDocuments(filters);
      
      // Get the filtered results with only the specified fields
      const courses = await Course.find(filters, {
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
        description: 1    // Description
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
          description 
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
          description
        };
      });

      const filterDescription = Object.keys(filters).length > 0 
        ? `with filters: ${JSON.stringify(filters)}` 
        : 'with no filters';
        
      logger.info(`Retrieved filtered courses ${filterDescription}: ${formattedCourses.length} courses on page ${validPage} of ${pages}`);
      
      return {
        courses: formattedCourses,
        total,
        pages
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
   * @returns Array of course documents
   */
  static async getCoursesByCreator(userId: string): Promise<ICourse[]> {
    try {
      return await Course.find({ creatorUserId: userId })
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
        course.localizations.set(locale, content);
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