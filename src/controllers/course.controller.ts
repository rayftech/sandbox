// src/controllers/course.controller.ts
import { Request, Response, NextFunction } from 'express';
import { validationResult, body } from 'express-validator';
import { asyncHandler } from '../middlewares/error.middleware';
import { CourseService, ICourseUpdateData } from '../services/course.service';
import { StrapiSyncService } from '../services/strapi-sync.service';
import { createLogger } from '../config/logger';
import { EventPublisher } from '../services/event.publisher';
import { EventType } from '../models/events.model';
import { ApiError } from '../middlewares/error.middleware';

const logger = createLogger('CourseController');

/**
 * Controller for course-related operations
 * Implements the adapter pattern between HTTP requests and service layer
 */
export class CourseController {
  private static eventPublisher: EventPublisher = EventPublisher.getInstance();
  private static strapiSyncService: StrapiSyncService = StrapiSyncService.getInstance();

  /**
   * Create a new course
   * @route POST /api/courses
   */
  public static createCourse = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    // Validate request using express-validator (should be applied as middleware)
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

      // Use a transaction to ensure data consistency
      const course = await CourseService.createCourse(courseData);

      // After successful MongoDB creation, create in Strapi using a separate process
      // This prevents Strapi delays from affecting the user experience
      try {
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

        // Attempt to create in Strapi, but don't block response
        CourseController.strapiSyncService.createCourseInStrapi(strapiCourseData)
          .then(strapiId => {
            // Once Strapi creation completes, update our MongoDB document with strapiId
            // Create a proper update data object that matches ICourseUpdateData
            const updateData: ICourseUpdateData = {
              strapiId: strapiId
            };
            
            return CourseService.updateCourse(
              course._id.toString(),
              updateData,
              userId
            );
          })
          .catch(error => {
            logger.error(`Failed to create course in Strapi: ${error instanceof Error ? error.message : String(error)}`);
            // Consider adding a record to a retry queue for failed Strapi creations
          });
      } catch (strapiError) {
        // Log Strapi error but don't fail the request - handle with eventual consistency
        logger.error(`Error creating course in Strapi: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
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
        // Log event publishing error but don't fail the request
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

    // Validation can be done with middleware using express-validator

    try {
      // Update in MongoDB
      const updatedCourse = await CourseService.updateCourse(courseId, updateData, userId);

      // After successful MongoDB update, update in Strapi asynchronously
      if (updatedCourse.strapiId) {
        try {
          // Prepare data for Strapi update
          const strapiUpdateData: Record<string, any> = {
            name: updatedCourse.name,
            code: updatedCourse.code,
            courseLevel: updatedCourse.level,
            startDate: updatedCourse.startDate,
            endDate: updatedCourse.endDate,
            isActive: updatedCourse.isActive,
            country: updatedCourse.country || 'Unknown'
          };

          // Optional fields
          if ('description' in updateData) {
            strapiUpdateData.description = updateData.description;
          }
          if ('expectedEnrollment' in updateData) {
            strapiUpdateData.expectedEnrollment = updateData.expectedEnrollment;
          }
          if ('targetIndustryPartnership' in updateData) {
            strapiUpdateData.targetIndustryPartnership = updateData.targetIndustryPartnership;
          }

          // Update in Strapi without blocking response using our new method
          CourseController.strapiSyncService.updateCourseInStrapi(updatedCourse.strapiId, strapiUpdateData)
            .catch(error => {
              logger.error(`Failed to update course in Strapi: ${error instanceof Error ? error.message : String(error)}`);
            });
        } catch (strapiError) {
          logger.error(`Error preparing Strapi course update: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
        }
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

      // After successful MongoDB deletion, delete from Strapi asynchronously
      if (course.strapiId) {
        try {
          // Use our new method for Strapi deletion
          CourseController.strapiSyncService.deleteCourseInStrapi(course.strapiId)
            .catch(error => {
              logger.error(`Failed to delete course in Strapi: ${error instanceof Error ? error.message : String(error)}`);
            });
        } catch (strapiError) {
          logger.error(`Error with Strapi course deletion: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
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

    // Update in Strapi asynchronously
    if (updatedCourse.strapiId) {
      try {
        // Use our new method for updating Strapi
        CourseController.strapiSyncService.updateCourseInStrapi(updatedCourse.strapiId, { isActive })
          .catch(error => {
            logger.error(`Failed to update course status in Strapi: ${error instanceof Error ? error.message : String(error)}`);
          });
      } catch (strapiError) {
        logger.error(`Error updating course status in Strapi: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
      }
    }

    return res.status(200).json({
      status: 'success',
      data: {
        course: updatedCourse
      }
    });
  });
}