// src/controllers/course.controller.ts
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { asyncHandler } from '../middlewares/error.middleware';
import { CourseService, ICourseUpdateData } from '../services/course.service';
import { createLogger } from '../config/logger';
import { EventPublisher } from '../services/event.publisher';
import { EventType } from '../models/events.model';
import { ApiError } from '../middlewares/error.middleware';
import { RequestResponseService } from '../services/request-response.service';

const logger = createLogger('CourseController');

/**
 * Controller for course-related operations
 * Implements the adapter pattern between HTTP requests and service layer
 * Uses RequestResponseService for reliable Strapi operations
 */
export class CourseController {
  private static eventPublisher: EventPublisher = EventPublisher.getInstance();
  private static requestResponseService: RequestResponseService = RequestResponseService.getInstance();

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

      // First create in MongoDB (our source of truth)
      const course = await CourseService.createCourse(courseData);

      // Prepare data for Strapi (keeping only what Strapi needs)
      const strapiCourseData = {
        name: course.name,
        code: course.code,
        userId: userId,
        courseLevel: course.level,
        startDate: course.startDate,
        endDate: course.endDate,
        isActive: course.isActive,
        country: course.country || 'Unknown',
        description: courseData.description || '',
        expectedEnrollment: courseData.expectedEnrollment,
        targetIndustryPartnership: courseData.targetIndustryPartnership,
        preferredPartnerRepresentative: courseData.preferredPartnerRepresentative
      };

      // Use the request-response pattern to create in Strapi 
      // This could be implemented as a fire-and-forget approach, but here we wait for confirmation
      try {
        const strapiId = await CourseController.requestResponseService.createCourse(
          strapiCourseData, 
          userId
        );

        // Update MongoDB with the Strapi ID
        if (strapiId) {
          const updateData: ICourseUpdateData = { strapiId };
          await CourseService.updateCourse(course._id.toString(), updateData, userId);
          logger.info(`Updated course ${course._id} with Strapi ID ${strapiId}`);
        }
      } catch (strapiError) {
        // If Strapi operation fails, we still have the MongoDB record
        // We could consider adding this to a retry queue
        logger.error(`Failed to create course in Strapi: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
      }

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

      // Return success response immediately
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
            isActive: course.isActive,
            createdAt: course.createdAt
          }
        }
      });
    } catch (error) {
      logger.error(`Error creating course: ${error instanceof Error ? error.message : String(error)}`);
      throw error; // Let the error middleware handle it
    }
  });

  /**
   * Update course by ID
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
      // First get the current course to check if it has a Strapi ID
      const existingCourse = await CourseService.getCourseById(courseId);
      
      if (!existingCourse) {
        return res.status(404).json({
          status: 'error',
          message: 'Course not found'
        });
      }

      // Update in MongoDB first (our source of truth)
      const updatedCourse = await CourseService.updateCourse(courseId, updateData, userId);

      // If course has a Strapi ID, update in Strapi using request-response pattern
      if (updatedCourse.strapiId) {
        try {
          // Prepare data for Strapi update
          const strapiUpdateData = {
            name: updatedCourse.name,
            code: updatedCourse.code,
            courseLevel: updatedCourse.level,
            startDate: updatedCourse.startDate,
            endDate: updatedCourse.endDate,
            isActive: updatedCourse.isActive,
            country: updatedCourse.country || 'Unknown'
          };

        //   // Add optional fields if present in the update
        //   if ('description' in updateData) {
        //     strapiUpdateData.description = updateData.description;
        //   }
        //   if ('expectedEnrollment' in updateData) {
        //     strapiUpdateData.expectedEnrollment = updateData.expectedEnrollment;
        //   }
        //   if ('targetIndustryPartnership' in updateData) {
        //     strapiUpdateData.targetIndustryPartnership = updateData.targetIndustryPartnership;
        //   }
        //   if ('preferredPartnerRepresentative' in updateData) {
        //     strapiUpdateData.preferredPartnerRepresentative = updateData.preferredPartnerRepresentative;
        //   }

          // Update in Strapi without blocking response
          await CourseController.requestResponseService.updateCourse(
            updatedCourse.strapiId,
            strapiUpdateData,
            userId
          );
          
          logger.info(`Updated course in Strapi with ID ${updatedCourse.strapiId}`);
        } catch (strapiError) {
          logger.error(`Failed to update course in Strapi: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
          // Consider adding to a retry queue
        }
      } else {
        logger.warn(`Course ${courseId} has no Strapi ID, skipping Strapi update`);
      }

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
   * Delete course by ID
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
      // Get course before deletion to check for strapiId
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

      // If course has a Strapi ID, delete from Strapi using request-response pattern
      if (course.strapiId) {
        try {
          await CourseController.requestResponseService.deleteCourse(course.strapiId, userId);
          logger.info(`Deleted course from Strapi with ID ${course.strapiId}`);
        } catch (strapiError) {
          logger.error(`Failed to delete course in Strapi: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
          // Consider adding to a cleanup queue for orphaned Strapi entries
        }
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
   * Get all courses or filter by query parameters
   * @route GET /api/courses
   */
  public static getCourses = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { level, active, country, page, limit } = req.query;
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

    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;

    // Get paginated courses with filters
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
   * Get course by ID
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

    const course = await CourseService.getCourseById(courseId);

    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        course
      }
    });
  });

  /**
   * Get courses by creator ID
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

    const courses = await CourseService.getCoursesByCreator(userId);

    return res.status(200).json({
      status: 'success',
      data: {
        courses
      }
    });
  });

  /**
   * Search courses by name, code, or description
   * @route GET /api/courses/search
   */
  public static searchCourses = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { q, limit } = req.query;

    if (!q) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query is required'
      });
    }

    const limitNum = limit ? parseInt(limit as string, 10) : 10;
    const courses = await CourseService.searchCourses(q as string, limitNum);

    return res.status(200).json({
      status: 'success',
      data: {
        courses
      }
    });
  });

  /**
   * Get course stats by academic period
   * @route GET /api/courses/stats/academic
   */
  public static getCourseStatsByAcademicPeriod = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const stats = await CourseService.getCourseStatsByAcademicPeriod();

    return res.status(200).json({
      status: 'success',
      data: {
        stats
      }
    });
  });

  /**
   * Get course stats by country
   * @route GET /api/courses/stats/country
   */
  public static getCourseStatsByCountry = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const stats = await CourseService.getCourseStatsByCountry();

    return res.status(200).json({
      status: 'success',
      data: {
        stats
      }
    });
  });

  /**
   * Set course active status
   * @route PATCH /api/courses/:courseId/status
   */
  public static setCourseActiveStatus = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { courseId } = req.params;
    const { isActive } = req.body;
    const { userId } = req.user; // From auth middleware

    if (isActive === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'isActive status is required'
      });
    }

    const updatedCourse = await CourseService.setCourseActiveStatus(courseId, isActive, userId);

    // Update in Strapi using request-response pattern
    if (updatedCourse.strapiId) {
      try {
        await CourseController.requestResponseService.updateCourse(
          updatedCourse.strapiId, 
          { isActive }, 
          userId
        );
        logger.info(`Updated course status in Strapi with ID ${updatedCourse.strapiId}`);
      } catch (strapiError) {
        logger.error(`Failed to update course status in Strapi: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
      }
    }

    return res.status(200).json({
      status: 'success',
      data: {
        course: updatedCourse
      }
    });
  });

  /**
   * Manually synchronize a course with Strapi
   * @route POST /api/courses/:courseId/sync
   */
  public static syncCourseWithStrapi = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { courseId } = req.params;
    const { userId } = req.user;

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

    // Get the course to sync
    const course = await CourseService.getCourseById(courseId);
    
    if (!course) {
      return res.status(404).json({
        status: 'error',
        message: 'Course not found'
      });
    }

    try {
      // Prepare Strapi data
      const strapiData = {
        name: course.name,
        code: course.code,
        userId: course.creatorUserId,
        courseLevel: course.level,
        startDate: course.startDate,
        endDate: course.endDate,
        isActive: course.isActive,
        country: course.country || 'Unknown'
      };

      let strapiId = course.strapiId;
      let result;
      
      if (strapiId) {
        // Update in Strapi
        result = await CourseController.requestResponseService.updateCourse(
          strapiId,
          strapiData,
          userId
        );
        logger.info(`Synchronized existing course in Strapi with ID ${strapiId}`);
      } else {
        // Create in Strapi
        strapiId = await CourseController.requestResponseService.createCourse(
          strapiData,
          userId
        );
        
        // Update MongoDB with Strapi ID
        if (strapiId) {
          const updateData: ICourseUpdateData = { strapiId };
          await CourseService.updateCourse(courseId, updateData, userId);
          logger.info(`Created and linked new course in Strapi with ID ${strapiId}`);
          result = true;
        } else {
          throw new Error('Failed to create course in Strapi');
        }
      }

      return res.status(200).json({
        status: 'success',
        data: {
          message: `Course successfully synchronized with Strapi (ID: ${strapiId})`,
          strapiId,
          success: !!result
        }
      });
    } catch (error) {
      logger.error(`Error synchronizing course with Strapi: ${error instanceof Error ? error.message : String(error)}`);
      throw new ApiError(500, `Failed to synchronize with Strapi: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}