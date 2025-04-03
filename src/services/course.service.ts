// src/services/course.service.ts
import mongoose from 'mongoose';
import { Course, ICourse, CourseLevel } from '../models/course.model';
import { User, IUser } from '../models/user.model';
import { StrapiSyncService } from './strapi-sync.service';
import { createLogger } from '../config/logger';
import { RetryUtility } from '../utils/retry.util';
import { ItemLifecycleStatus } from '../models/status.enum';
import { EventPublisher } from './event.publisher';
import { EventType } from '../models/events.model';

const logger = createLogger('CourseService');

/**
 * Interface for course creation data
 */
export interface ICourseCreationData {
  creatorUserId: string;           // Amplify userId of creator
  name: string;                    // Name of the course
  code: string;                    // Course code
  level: CourseLevel;              // Course level (for matching)
  startDate: Date;                 // Start date
  endDate: Date;                   // End date
  country: string;                 // Country
  organisation?: string;           // Academic organisation
  description?: string;            // Course description (will be stored in Strapi)
  expectedEnrollment?: number;     // Expected enrollment (will be stored in Strapi)
  assessmentRedesign?: string;     // Assessment redesign info (will be stored in Strapi)
  targetIndustryPartnership?: string; // Target industry (will be stored in Strapi)
  preferredPartnerRepresentative?: string; // Preferred partner (will be stored in Strapi)
}

/**
 * Interface for course update data
 */
export interface ICourseUpdateData {
  strapiId?: string;               // ID in Strapi CMS
  name?: string;                   // Name of the course
  code?: string;                   // Course code
  level?: CourseLevel;             // Course level (for matching)
  startDate?: Date;                // Start date
  endDate?: Date;                  // End date
  country?: string;                // Country
  organisation?: string;           // Academic organisation
  isActive?: boolean;              // Active status
  status?: ItemLifecycleStatus;    // Lifecycle status
  strapiCreatedAt?: Date;          // When created in Strapi
  strapiUpdatedAt?: Date;          // When updated in Strapi
  
  // Extended fields for Strapi (not stored in MongoDB)
  description?: string;            // Course description
  expectedEnrollment?: number;     // Expected enrollment
  assessmentRedesign?: string;     // Assessment redesign info
  targetIndustryPartnership?: string; // Target industry
  preferredPartnerRepresentative?: string; // Preferred partner
}

/**
 * Course service class for managing course operations
 * Implements core business logic for course-related functionality
 * Uses a hybrid storage approach with MongoDB and Strapi CMS
 */
export class CourseService {
  private static strapiSyncService = StrapiSyncService.getInstance();
  private static eventPublisher = EventPublisher.getInstance();

  /**
   * Create a new course
   * Modified to handle the strapiId requirement by:
   * 1. Creating in Strapi first
   * 2. Then creating in MongoDB with the strapiId
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

      // 1. Create in Strapi first to get strapiId
      const strapiCourseData = {
        name: courseData.name,
        code: courseData.code,
        userId: courseData.creatorUserId,
        courseLevel: courseData.level,
        startDate: courseData.startDate.toISOString().split('T')[0],
        endDate: courseData.endDate.toISOString().split('T')[0],
        isActive: true,
        country: courseData.country || 'Unknown',
        organisation: courseData.organisation || '',
        expectedEnrollment: courseData.expectedEnrollment || null,
        preferredPartnerRepresentative: courseData.preferredPartnerRepresentative || '',

        description: courseData.description 
        ? [{ 
            type: 'paragraph', 
            children: [{ text: courseData.description }] 
          }] 
        : [],

        assessmentRedesign: courseData.assessmentRedesign 
        ? [{ 
            type: 'paragraph', 
            children: [{ text: courseData.assessmentRedesign }] 
          }] 
        : [],

        // Validate targetIndustryPartnership against schema enum
        targetIndustryPartnership: this.validateIndustryPartnership(
          courseData.targetIndustryPartnership
        ),
      };

      logger.info(`Creating course in Strapi first: ${courseData.name}`);
      let strapiId;
      
      try {
        strapiId = await this.strapiSyncService.createCourseInStrapi(strapiCourseData);
        logger.info(`Successfully created course in Strapi with ID: ${strapiId}`);
      } catch (strapiError) {
        logger.warn(`Failed to create course in Strapi: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
        // We'll continue with a temporary ID, which we'll update later
        strapiId = `temp-${new mongoose.Types.ObjectId().toString()}`;
        logger.info(`Using temporary strapiId: ${strapiId}`);
      }

      // 2. Now create in MongoDB with the strapiId we got
      const now = new Date();
      
      // Create the new course with the strapiId
      const course = new Course({
        creatorUserId: courseData.creatorUserId,
        name: courseData.name,
        code: courseData.code,
        level: courseData.level,
        startDate: courseData.startDate,
        endDate: courseData.endDate,
        country: courseData.country || 'Unknown',
        organisation: courseData.organisation || '',
        isActive: true,
        status: ItemLifecycleStatus.UPCOMING, // Will be updated by pre-save middleware
        strapiId: strapiId, // Use the ID we got from Strapi or our temporary one
        strapiCreatedAt: now,
        strapiUpdatedAt: now
      });

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

      // Publish course creation event if we have the event publisher
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

  // validate for industry partnership 
  // Validation method for industry partnership
  private static validateIndustryPartnership(partnership?: string): string | null {
    const validPartnerships = [
      'Financial Services', 'Technology Consulting', 'Cybersecurity', 
      // ... other valid values from schema
    ];
    
    return partnership && validPartnerships.includes(partnership) 
      ? partnership 
      : null;
  }

  /**
   * Update the strapiId for a course
   * Used to update a temporary strapiId with a real one
   * 
   * @param courseId The MongoDB ID of the course
   * @param strapiId The new Strapi ID
   * @param userId The userId of the user making the update (for permission check)
   * @returns The updated course document
   */
  static async updateStrapiId(
    courseId: string,
    strapiId: string,
    userId: string
  ): Promise<ICourse> {
    try {
      return await this.updateCourse(
        courseId,
        { strapiId },
        userId
      );
    } catch (error) {
      logger.error(`Error updating strapiId: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
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

      // Extract MongoDB-only fields for the update
      const mongoUpdateData: Partial<ICourse> = {
        name: updateData.name,
        code: updateData.code,
        level: updateData.level,
        startDate: updateData.startDate,
        endDate: updateData.endDate,
        country: updateData.country,
        organisation: updateData.organisation,
        isActive: updateData.isActive,
        strapiId: updateData.strapiId,
        strapiUpdatedAt: new Date() // Update the last Strapi update timestamp
      };

      // Apply updates to the course object
      Object.assign(course, mongoUpdateData);
      
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
      
      const course = await Course.findById(courseId);
      
      // If course has a strapiId, attempt to fetch enriched data from Strapi
      if (course && course.strapiId && !course.strapiId.startsWith('temp-')) {
        try {
          // Use RetryUtility for robust fetching from Strapi
          await RetryUtility.withRetry(async () => {
            const strapiData = await this.strapiSyncService.getCourseBystrapiId(course.strapiId);
            
            if (strapiData && strapiData.attributes) {
              // Attach Strapi data as a non-persisted property
              (course as any).strapiData = strapiData.attributes;
            }
          }, {
            maxRetries: 3, 
            initialDelay: 500
          });
        } catch (strapiError) {
          logger.warn(`Could not fetch Strapi data for course ${courseId}: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
          // Continue anyway - we can return the MongoDB data
        }
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
}