// src/controllers/course.controller.ts - Complete implementation
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { asyncHandler } from '../middlewares/error.middleware';
import { CourseService } from '../services/course.service';
import { createLogger } from '../config/logger';
import { EventPublisher } from '../services/event.publisher';
import { EventType } from '../models/events.model';
import { ApiError } from '../middlewares/error.middleware';

const logger = createLogger('CourseController');

/**
 * Controller for course-related operations
 * Implements the adapter pattern between HTTP requests and service layer
 * Uses MongoDB as the single source of truth for course data
 */
export class CourseController {
  private static eventPublisher: EventPublisher = EventPublisher.getInstance();

  /**
   * Create a new course
   * @route POST /api/courses
   */
  public static createCourse = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    // Validate request using express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const courseData = req.body;
    const { userId } = req.user; // Assuming auth middleware attaches user info

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User ID is required to create a course'
      });
    }

    try {
      // Add creator ID to course data
      courseData.creatorUserId = userId;

      // Create course in MongoDB (our source of truth)
      const course = await CourseService.createCourse(courseData);

      // Publish course creation event to RabbitMQ asynchronously
      try {
        await CourseController.eventPublisher.publishCourseEvent(
          EventType.COURSE_CREATED,
          {
            courseId: course._id.toString(),
            name: course.name,
            code: course.code,
            level: course.level,
            creatorUserId: userId,
            startDate: course.startDate,
            endDate: course.endDate
          }
        );
        logger.info(`Published COURSE_CREATED event for course ${course._id}`);
      } catch (eventError) {
        logger.error(`Error publishing course creation event: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
      }

      // Return success response
      return res.status(201).json({
        status: 'success',
        data: {
          course: {
            id: course._id,
            name: course.name,
            code: course.code,
            level: course.level,
            startDate: course.startDate,
            endDate: course.endDate,
            country: course.country,
            organisation: course.organisation,
            isActive: course.isActive,
            createdAt: course.createdAt,
            description: course.description,
            assessmentRedesign: course.assessmentRedesign,
            expectedEnrollment: course.expectedEnrollment,
            targetIndustryPartnership: course.targetIndustryPartnership,
            preferredPartnerRepresentative: course.preferredPartnerRepresentative,
            multimedia: course.multimedia,
            // Add other fields as needed
          }
        }
      });
    } catch (error) {
      logger.error(`Error creating course: ${error instanceof Error ? error.message : String(error)}`);
      throw error; // Let the error middleware handle it
    }
  });

  /**
   * Get a course by ID
   * @route GET /api/courses/:courseId
   */
  public static getCourseById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        status: 'error',
        message: 'Course ID is required'
      });
    }

    try {
      const course = await CourseService.getCourseById(courseId);

      if (!course) {
        return res.status(404).json({
          status: 'error',
          message: `Course with ID ${courseId} not found`
        });
      }

      return res.status(200).json({
        status: 'success',
        data: {
          course
        }
      });
    } catch (error) {
      logger.error(`Error getting course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  

  /**
   * Update a course
   * @route PUT /api/courses/:courseId
   */
  public static updateCourse = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { courseId } = req.params;
    const updateData = req.body;
    const { userId } = req.user; // From auth middleware

    if (!courseId) {
      return res.status(400).json({
        status: 'error',
        message: 'Course ID is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    try {
      // Check if course exists
      const existingCourse = await CourseService.getCourseById(courseId);
      
      if (!existingCourse) {
        return res.status(404).json({
          status: 'error',
          message: 'Course not found'
        });
      }

      // Update in MongoDB (our source of truth)
      const updatedCourse = await CourseService.updateCourse(courseId, updateData, userId);

      // Publish course update event asynchronously
      try {
        await CourseController.eventPublisher.publishCourseEvent(
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

      return res.status(200).json({
        status: 'success',
        data: {
          course: updatedCourse
        }
      });
    } catch (error) {
      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes('Permission denied')) {
          throw new ApiError(403, error.message);
        } else if (error.message.includes('not found')) {
          throw new ApiError(404, error.message);
        }
      }
      throw error; // Let the error middleware handle general errors
    }
  });

  /**
   * Delete a course
   * @route DELETE /api/courses/:courseId
   */
  public static deleteCourse = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { courseId } = req.params;
    const { userId } = req.user; // From auth middleware

    if (!courseId) {
      return res.status(400).json({
        status: 'error',
        message: 'Course ID is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    try {
      // Get course before deletion for event publishing
      const course = await CourseService.getCourseById(courseId);

      if (!course) {
        return res.status(404).json({
          status: 'error',
          message: 'Course not found'
        });
      }

      // Delete from MongoDB
      const result = await CourseService.deleteCourse(courseId, userId);

      if (!result) {
        return res.status(400).json({
          status: 'error',
          message: 'Failed to delete course'
        });
      }

      // Publish course deletion event asynchronously
      try {
        await CourseController.eventPublisher.publishCourseEvent(
          EventType.COURSE_DELETED,
          {
            courseId: courseId,
            name: course.name,
            code: course.code,
            level: course.level,
            creatorUserId: course.creatorUserId,
            startDate: course.startDate,
            endDate: course.endDate
          }
        );
        logger.info(`Published COURSE_DELETED event for course ${courseId}`);
      } catch (eventError) {
        logger.error(`Error publishing course deletion event: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
      }

      return res.status(200).json({
        status: 'success',
        message: 'Course deleted successfully'
      });
    } catch (error) {
      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes('Permission denied')) {
          throw new ApiError(403, error.message);
        } else if (error.message.includes('active partnerships')) {
          throw new ApiError(400, error.message);
        }
      }
      throw error; // Let the error middleware handle general errors
    }
  });

  /**
   * Get courses by organisation
   * @route GET /api/courses/organisation/:organisation
   */
  public static getCoursesByOrganisation = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { organisation } = req.params;

    if (!organisation) {
      return res.status(400).json({
        status: 'error',
        message: 'Organisation parameter is required'
      });
    }

    try {
      const courses = await CourseService.getCoursesByOrganisation(organisation);

      return res.status(200).json({
        status: 'success',
        data: {
          courses,
          count: courses.length,
          organisation
        }
      });
    } catch (error) {
      logger.error(`Error fetching courses by organisation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get course stats by organisation
   * @route GET /api/courses/stats/organisation
   */
  public static getCourseStatsByOrganisation = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const stats = await CourseService.getCourseStatsByOrganisation();

      return res.status(200).json({
        status: 'success',
        data: {
          stats,
          count: stats.length
        }
      });
    } catch (error) {
      logger.error(`Error fetching organisation statistics: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get courses by country
   * @route GET /api/courses/country/:country
   */
  public static getCoursesByCountry = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { country } = req.params;

    if (!country) {
      return res.status(400).json({
        status: 'error',
        message: 'Country parameter is required'
      });
    }

    try {
      const courses = await CourseService.getCoursesByCountry(country);

      return res.status(200).json({
        status: 'success',
        data: {
          courses,
          count: courses.length,
          country
        }
      });
    } catch (error) {
      logger.error(`Error fetching courses by country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get courses by creator
   * @route GET /api/courses/user/:userId
   */
  public static getCoursesByCreator = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    try {
      const courses = await CourseService.getCoursesByCreator(userId);

      return res.status(200).json({
        status: 'success',
        data: {
          courses,
          count: courses.length,
          userId
        }
      });
    } catch (error) {
      logger.error(`Error fetching courses by creator: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get course statistics by academic period
   * @route GET /api/courses/stats/academic
   */
  public static getCourseStatsByAcademicPeriod = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const stats = await CourseService.getCourseStatsByAcademicPeriod();

      return res.status(200).json({
        status: 'success',
        data: {
          stats,
          count: stats.length
        }
      });
    } catch (error) {
      logger.error(`Error fetching course statistics by academic period: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get course statistics by country
   * @route GET /api/courses/stats/country
   */
  public static getCourseStatsByCountry = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const stats = await CourseService.getCourseStatsByCountry();

      return res.status(200).json({
        status: 'success',
        data: {
          stats,
          count: stats.length
        }
      });
    } catch (error) {
      logger.error(`Error fetching course statistics by country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Enhanced search courses method to handle country and organisation filtering
   * @route GET /api/courses/search
   */
  public static searchCourses = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { q, country, organisation, limit } = req.query;
    
    // Ensure at least one search parameter is provided
    if (!q && !country && !organisation) {
      return res.status(400).json({
        status: 'error',
        message: 'At least one search parameter (q, country, or organisation) is required'
      });
    }

    const limitNum = limit ? parseInt(limit as string, 10) : 10;
    
    try {
      // Create filter object based on provided parameters
      const filters: any = {};
      
      if (country) {
        filters.country = country;
      }
      
      if (organisation) {
        filters.organisation = organisation;
      }
      
      // Use text search if q parameter is provided, otherwise use filters
      let courses;
      if (q) {
        courses = await CourseService.searchCourses(q as string, limitNum, filters);
      } else {
        // Use service method instead of direct model access for better encapsulation
        courses = await CourseService.getPaginatedCourses(1, limitNum, filters);
        courses = courses.courses; // Extract the courses array from the result
      }

      return res.status(200).json({
        status: 'success',
        data: {
          courses,
          count: courses.length,
          searchParams: { q, country, organisation }
        }
      });
    } catch (error) {
      logger.error(`Error searching courses: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get all courses with optional filtering
   * @route GET /api/courses
   */
  public static getCourses = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { level, active, country, organisation, page, limit } = req.query;
    const filters: any = {};

    // Build filters based on query parameters
    if (level) {
      filters.level = level;
    }

    if (active !== undefined) {
      filters.isActive = active === 'true';
    }

    if (country) {
      filters.country = country;
    }
    
    if (organisation) {
      filters.organisation = organisation;
    }

    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;

    // Get paginated courses with filters directly from MongoDB
    const result = await CourseService.getPaginatedCourses(pageNum, limitNum, filters);

    return res.status(200).json({
      status: 'success',
      data: {
        courses: result.courses,
        pagination: {
          total: result.total,
          pages: result.pages,
          page: pageNum,
          limit: limitNum
        }
      }
    });
  });
  
  /**
   * Update course active status
   * @route PATCH /api/courses/:courseId/status
   */
  public static setCourseActiveStatus = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { courseId } = req.params;
    const { isActive } = req.body;
    const { userId } = req.user; // From auth middleware

    if (!courseId) {
      return res.status(400).json({
        status: 'error',
        message: 'Course ID is required'
      });
    }

    if (isActive === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'isActive status is required'
      });
    }

    try {
      // Update course status in MongoDB
      const updatedCourse = await CourseService.setCourseActiveStatus(courseId, isActive, userId);

      // Publish course update event
      try {
        await CourseController.eventPublisher.publishCourseEvent(
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
        logger.info(`Published COURSE_UPDATED event for course ${updatedCourse._id} (status change)`);
      } catch (eventError) {
        logger.error(`Error publishing course update event: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
      }

      return res.status(200).json({
        status: 'success',
        data: {
          course: updatedCourse
        }
      });
    } catch (error) {
      logger.error(`Error updating course status: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Add multimedia files to a course
   * @route POST /api/courses/:courseId/multimedia
   */
  public static addMultimediaFiles = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { courseId } = req.params;
    const { userId } = req.user;
    const files = req.body.files;

    if (!courseId) {
      return res.status(400).json({
        status: 'error',
        message: 'Course ID is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Files array is required'
      });
    }

    try {
      // Add multimedia files to the course
      const updatedCourse = await CourseService.addMultimediaFiles(courseId, files, userId);

      return res.status(200).json({
        status: 'success',
        data: {
          message: `Successfully added ${files.length} multimedia files to course`,
          course: updatedCourse
        }
      });
    } catch (error) {
      logger.error(`Error adding multimedia files: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.message.includes('Permission denied')) {
        throw new ApiError(403, error.message);
      } else if (error instanceof Error && error.message.includes('not found')) {
        throw new ApiError(404, error.message);
      }
      
      throw new ApiError(500, `Failed to add multimedia files: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  /**
   * Remove a multimedia file from a course
   * @route DELETE /api/courses/:courseId/multimedia/:fileId
   */
  public static removeMultimediaFile = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { courseId, fileId } = req.params;
    const { userId } = req.user;

    if (!courseId) {
      return res.status(400).json({
        status: 'error',
        message: 'Course ID is required'
      });
    }

    if (!fileId) {
      return res.status(400).json({
        status: 'error',
        message: 'File ID is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    try {
      // Remove the multimedia file from the course
      const updatedCourse = await CourseService.removeMultimediaFile(courseId, fileId, userId);

      return res.status(200).json({
        status: 'success',
        data: {
          message: `Successfully removed multimedia file from course`,
          course: updatedCourse
        }
      });
    } catch (error) {
      logger.error(`Error removing multimedia file: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.message.includes('Permission denied')) {
        throw new ApiError(403, error.message);
      } else if (error instanceof Error && error.message.includes('not found')) {
        throw new ApiError(404, error.message);
      }
      
      throw new ApiError(500, `Failed to remove multimedia file: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  /**
   * Update course localizations
   * @route PUT /api/courses/:courseId/localizations
   */
  public static updateLocalizations = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { courseId } = req.params;
    const { userId } = req.user;
    const { localizations } = req.body;

    if (!courseId) {
      return res.status(400).json({
        status: 'error',
        message: 'Course ID is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    if (!localizations || typeof localizations !== 'object' || Object.keys(localizations).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Localizations object is required'
      });
    }

    try {
      // Update course localizations
      const updatedCourse = await CourseService.updateLocalizations(courseId, localizations, userId);

      return res.status(200).json({
        status: 'success',
        data: {
          message: `Successfully updated course localizations`,
          course: updatedCourse
        }
      });
    } catch (error) {
      logger.error(`Error updating localizations: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.message.includes('Permission denied')) {
        throw new ApiError(403, error.message);
      } else if (error instanceof Error && error.message.includes('not found')) {
        throw new ApiError(404, error.message);
      }
      
      throw new ApiError(500, `Failed to update localizations: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  
  /**
   * Get a list of all courses with pagination and selected fields
   * @route GET /api/courses/list
   */
  public static getCoursesList = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { page, limit } = req.query;
    
    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;

    try {
      // Get paginated courses with selected fields
      const result = await CourseService.getPaginatedCoursesList(pageNum, limitNum);

      return res.status(200).json({
        status: 'success',
        data: {
          courses: result.courses,
          pagination: {
            total: result.total,
            pages: result.pages,
            page: pageNum,
            limit: limitNum
          }
        }
      });
    } catch (error) {
      logger.error(`Error fetching courses list: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
  
  /**
   * Get filtered courses by specific field values with pagination
   * @route GET /api/courses/filter
   */
  public static getFilteredCourses = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { page, limit, level, country, organisation, isActive, status } = req.query;
    
    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;
    
    // Build filter object based on provided query parameters
    const filters: any = {};
    
    if (level) {
      filters.level = level;
    }
    
    if (country) {
      filters.country = country;
    }
    
    if (organisation) {
      filters.organisation = organisation;
    }
    
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    
    if (status) {
      filters.status = status;
    }

    try {
      // Get filtered courses with pagination
      const result = await CourseService.getFilteredCoursesList(pageNum, limitNum, filters);

      return res.status(200).json({
        status: 'success',
        data: {
          courses: result.courses,
          filters: Object.keys(filters).length > 0 ? filters : 'No filters applied',
          pagination: {
            total: result.total,
            pages: result.pages,
            page: pageNum,
            limit: limitNum
          }
        }
      });
    } catch (error) {
      logger.error(`Error fetching filtered courses: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
  
  /**
   * Get courses by user ID with pagination
   * @route GET /api/courses/user-courses/:userId
   */
  public static getCoursesByUserId = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const { page, limit, level, status } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }
    
    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;
    
    // Build filter object with the required userId
    const filters: any = { creatorUserId: userId };
    
    // Add additional filters if provided
    if (level) {
      filters.level = level;
    }
    
    if (status) {
      filters.status = status;
    }

    try {
      // Get courses by the specified user ID
      const result = await CourseService.getFilteredCoursesList(pageNum, limitNum, filters);

      return res.status(200).json({
        status: 'success',
        data: {
          courses: result.courses,
          userId,
          pagination: {
            total: result.total,
            pages: result.pages,
            page: pageNum,
            limit: limitNum
          }
        }
      });
    } catch (error) {
      logger.error(`Error fetching courses by user ID: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
}