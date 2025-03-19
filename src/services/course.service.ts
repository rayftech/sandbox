// src/services/course.service.ts
import mongoose from 'mongoose';
import { Course, ICourse, CourseLevel } from '../models/course.model';
import { User, IUser } from '../models/user.model';
import { StrapiSyncService } from './strapi-sync.service';
import { createLogger } from '../config/logger';
import { RetryUtility } from '../utils/retry.util';
import { ItemLifecycleStatus } from '../models/status.enum';

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
  private static strapiSyncService: StrapiSyncService = StrapiSyncService.getInstance();

  /**
   * Create a new course
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

      // Verify user exists
      const user = await User.findOne({ userId: courseData.creatorUserId });
      if (!user) {
        throw new Error(`Creator with userId ${courseData.creatorUserId} not found`);
      }

      // Set default values for required fields
      const now = new Date();
      
      // Create the new course (store minimal data in MongoDB)
      const course = new Course({
        creatorUserId: courseData.creatorUserId,
        name: courseData.name,
        code: courseData.code,
        level: courseData.level,
        startDate: courseData.startDate,
        endDate: courseData.endDate,
        country: courseData.country || 'Unknown',
        isActive: true,
        status: ItemLifecycleStatus.UPCOMING, // Will be updated by pre-save middleware
        strapiCreatedAt: now,
        strapiUpdatedAt: now
        // Note: strapiId will be set after successful creation in Strapi
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

      await session.commitTransaction();
      logger.info(`New course created in MongoDB: ${savedCourse._id} by user ${courseData.creatorUserId} from ${courseData.country || 'unknown'}`);

      return savedCourse;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error creating course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      session.endSession();
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
      if (course && course.strapiId) {
        try {
          // No need to await this - we'll return the MongoDB data and let Strapi
          // data be fetched asynchronously if needed by the consumer
          CourseService.enrichCourseWithStrapiData(course);
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

/**
 * Enrich a course with data from Strapi
 * @param course The course document to enrich
 * @returns Promise resolving to the enriched course
 */
static async enrichCourseWithStrapiData(course: ICourse): Promise<ICourse> {
  if (!course.strapiId) {
    return course; // No Strapi ID, return as is
  }

  try {
    // Use RetryUtility for a more robust fetch
    const strapiCourse = await RetryUtility.withRetryOrFallback(
      async () => {
        // Use the StrapiSyncService method instead of accessing strapiClient directly
        return await CourseService.strapiSyncService.getCourseBystrapiId(course.strapiId);
      },
      null, // Fallback to null if fetching fails
      { maxRetries: 3, initialDelay: 500 }
    );

    if (strapiCourse && strapiCourse.attributes) {
      // Attach Strapi data as a non-persisted property if needed
      (course as any).strapiData = strapiCourse.attributes;
    }

    return course;
  } catch (error) {
    logger.error(`Error enriching course with Strapi data: ${error instanceof Error ? error.message : String(error)}`);
    return course; // Return original course on error
  }
}



  /**
   * Get all courses created by a specific user
   * @param userId The userId of the creator
   * @returns Array of course documents
   */
  static async getCoursesByCreator(userId: string): Promise<ICourse[]> {
    try {
      // Verify user exists
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      return await Course.find({ creatorUserId: userId })
        .sort({ createdAt: -1 });
    } catch (error) {
      logger.error(`Error getting courses by creator: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get courses matching specific criteria
   * @param filters Object containing filter criteria
   * @returns Array of matching course documents
   */
  static async getCourses(filters: {
    level?: CourseLevel;
    isActive?: boolean;
    academicYear?: string;
    semester?: string;
    status?: ItemLifecycleStatus;
    country?: string;
    startDate?: { $gte?: Date, $lte?: Date };
    endDate?: { $gte?: Date, $lte?: Date };
  }): Promise<ICourse[]> {
    try {
      return await Course.find(filters)
        .sort({ createdAt: -1 });
    } catch (error) {
      logger.error(`Error getting courses with filters: ${error instanceof Error ? error.message : String(error)}`);
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

      logger.info(`Course ${courseId} updated by user ${userId}${updateData.country ? `, country set to: ${updateData.country}` : ''}`);
      return updatedCourse;
    } catch (error) {
      logger.error(`Error updating course: ${error instanceof Error ? error.message : String(error)}`);
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
   * Find courses that match a project's requirements
   * @param level The project level to match
   * @param startDate The earliest start date
   * @param endDate The latest end date
   * @returns Array of matching course documents
   */
  static async findMatchingCourses(
    level: CourseLevel,
    startDate: Date,
    endDate: Date
  ): Promise<ICourse[]> {
    try {
      // Find active courses with matching level and overlapping date range
      return await Course.find({
        isActive: true,
        level: level,
        // Course start date must be before or equal to project end date
        startDate: { $lte: endDate },
        // Course end date must be after or equal to project start date
        endDate: { $gte: startDate }
      });
    } catch (error) {
      logger.error(`Error finding matching courses: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Check if a course has any active partnerships
   * @param courseId The MongoDB ID of the course
   * @returns Boolean indicating if the course has active partnerships
   */
  private static async hasActivePartnerships(courseId: string): Promise<boolean> {
    try {
      const Partnership = mongoose.model('Partnership');
      const activePartnership = await Partnership.findOne({
        courseId: new mongoose.Types.ObjectId(courseId),
        status: 'approved'
      });
      
      return !!activePartnership;
    } catch (error) {
      logger.warn(`Error checking partnerships for course ${courseId}: ${error instanceof Error ? error.message : String(error)}`);
      // In case of error (e.g., Partnership model not registered yet), 
      // return false to allow operation to continue
      return false;
    }
  }

  /**
   * Get courses by country
   * @param country The country to filter by
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
   * Get course statistics by country
   * @returns Array of statistical groupings by country
   */
  static async getCourseStatsByCountry(): Promise<any[]> {
    try {
      return await Course.aggregate([
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
 * Search courses by name, code, or description
 * @param searchQuery The search string
 * @param limit Maximum number of results to return
 * @returns Array of matching course documents
 */
static async searchCourses(searchQuery: string, limit: number = 10): Promise<ICourse[]> {
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
        code: 'text'
      });
    }

    // Perform text search in MongoDB
    const mongodbCourses = await Course.find(
      { $text: { $search: searchQuery } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit);
    
    // Convert to plain array we can safely modify
    const courses: ICourse[] = mongodbCourses.map(doc => doc.toObject());
    
    // If we have few results, also try to search in Strapi
    if (courses.length < limit) {
      try {
        // Search in Strapi asynchronously
        const strapiSearchLimit = limit - courses.length;
        
        // Use the StrapiSyncService method instead of accessing strapiClient directly
        const strapiCourses = await CourseService.strapiSyncService.searchCourses(searchQuery, strapiSearchLimit);
        
        // Add Strapi search results to MongoDB results
        for (const strapiCourse of strapiCourses) {
          const strapiId = strapiCourse.id.toString();
          
          // Check if this Strapi course is already in our MongoDB results
          const existingCourse = courses.find(c => c.strapiId === strapiId);
          
          if (!existingCourse) {
            // Find or create a MongoDB record for this Strapi course
            const existingDoc = await Course.findOne({ strapiId });
            
            if (existingDoc) {
              // Add to results
              courses.push(existingDoc.toObject());
            } else {
              // Create a new MongoDB record for this Strapi course
              const newCourse = await CourseService.createCourseFromStrapi(strapiCourse);
              if (newCourse) {
                courses.push(newCourse.toObject());
              }
            }
          }
        }
      } catch (strapiError) {
        logger.warn(`Error searching courses in Strapi: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
        // Continue with MongoDB results only
      }
    }

    return courses.slice(0, limit); // Ensure we don't exceed the requested limit
  } catch (error) {
    logger.error(`Error searching courses: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Create a MongoDB course record from Strapi data
 * @param strapiCourse The Strapi course data
 * @returns The created course document
 */
private static async createCourseFromStrapi(strapiCourse: any): Promise<ICourse | null> {
  try {
    const attrs = strapiCourse.attributes;
    
    if (!attrs || !attrs.userId || !attrs.name || !attrs.code) {
      logger.warn(`Incomplete Strapi course data for ID ${strapiCourse.id}`);
      return null;
    }
    
    // Create a new course document
    const courseData = {
      strapiId: strapiCourse.id.toString(),
      creatorUserId: attrs.userId,
      name: attrs.name,
      code: attrs.code,
      level: attrs.courseLevel || CourseLevel.OTHER,
      startDate: new Date(attrs.startDate),
      endDate: new Date(attrs.endDate),
      country: attrs.country || 'Unknown',
      isActive: attrs.isActive !== undefined ? attrs.isActive : true,
      strapiCreatedAt: new Date(attrs.createdAt),
      strapiUpdatedAt: new Date(attrs.updatedAt)
    };
    
    const course = new Course(courseData);
    
    // Call methods on the course document
    course.setAcademicYearAndSemester();
    course.updateStatus();
    
    // Save the document
    const savedCourse = await course.save();
    return savedCourse;
  } catch (error) {
    logger.error(`Error creating course from Strapi data: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

  /**
   * Get course statistics grouped by academic year and semester
   * @returns Array of statistical groupings
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
      logger.error(`Error getting course statistics: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
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
}