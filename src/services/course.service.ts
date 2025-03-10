// src/services/course.service.ts
import mongoose from 'mongoose';
import { Course, ICourse, CourseLevel } from '../models/course.model';
import { User, IUser } from '../models/user.model';
import { createLogger } from '../config/logger';

const logger = createLogger('CourseService');

/**
 * Interface for course creation data
 */
export interface ICourseCreationData {
  creatorUserId: string; // Amplify userId of creator
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
}

/**
 * Interface for course update data
 */
export interface ICourseUpdateData {
  name?: string;
  code?: string;
  level?: CourseLevel;
  expectedEnrollment?: number;
  description?: string;
  assessmentRedesign?: string;
  targetIndustryPartnership?: string;
  preferredPartnerRepresentative?: string;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
}

/**
 * Course service class for managing course operations
 * Implements core business logic for course-related functionality
 */
export class CourseService {
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

      // Create the new course
      const course = new Course({
        creatorUserId: courseData.creatorUserId,
        name: courseData.name,
        code: courseData.code,
        level: courseData.level,
        expectedEnrollment: courseData.expectedEnrollment,
        description: courseData.description,
        assessmentRedesign: courseData.assessmentRedesign,
        targetIndustryPartnership: courseData.targetIndustryPartnership,
        preferredPartnerRepresentative: courseData.preferredPartnerRepresentative,
        startDate: courseData.startDate,
        endDate: courseData.endDate,
        isActive: true
      });

      // Calculate academic year and semester
      course.setAcademicYearAndSemester();

      // Save the course
      const savedCourse = await course.save({ session });
      
      // Update user analytics - increment course count
      await CourseService.incrementUserMetric(
        courseData.creatorUserId, 
        'totalCoursesCreated', 
        1,
        session
      );
      
      await session.commitTransaction();
      logger.info(`New course created: ${savedCourse._id} by user ${courseData.creatorUserId}`);
      
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
      
      return await Course.findById(courseId);
    } catch (error) {
      logger.error(`Error getting course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
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

      // Apply updates to the course object
      Object.assign(course, updateData);
      
      // Recalculate academic year and semester if dates changed
      if (updateData.startDate) {
        course.setAcademicYearAndSemester();
      }

      // Save the updated course
      const updatedCourse = await course.save();

      logger.info(`Course ${courseId} updated by user ${userId}`);
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
    // This implementation would typically involve the Partnership model
    // For now, it's a placeholder
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
        index.name === 'name_text_code_text_description_text'
      );
      
      if (!hasTextIndex) {
        await collection.createIndex({ 
          name: 'text', 
          code: 'text',
          description: 'text' 
        });
      }

      // Perform text search
      return await Course.find(
        { $text: { $search: searchQuery } },
        { score: { $meta: 'textScore' } }
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit);
    } catch (error) {
      logger.error(`Error searching courses: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
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
            avgEnrollment: { $avg: '$expectedEnrollment' },
            minEnrollment: { $min: '$expectedEnrollment' },
            maxEnrollment: { $max: '$expectedEnrollment' },
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