// src/controllers/course.controller.ts - Complete implementation
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { asyncHandler } from '../middlewares/error.middleware';
import { CourseService, ICourseUpdateData } from '../services/course.service';
// import { Course } from '../models/course.model';
import { createLogger } from '../config/logger';
import { EventPublisher } from '../services/event.publisher';
import { EventType } from '../models/events.model';
import { ApiError } from '../middlewares/error.middleware';
import { RequestResponseService } from '../services/request-response.service';
import { StrapiSyncService } from '../services/strapi-sync.service';

const logger = createLogger('CourseController');

/**
 * Controller for course-related operations
 * Implements the adapter pattern between HTTP requests and service layer
 * Uses RequestResponseService for reliable Strapi operations
 */
export class CourseController {
  private static eventPublisher: EventPublisher = EventPublisher.getInstance();
  private static requestResponseService: RequestResponseService = RequestResponseService.getInstance();
  private static strapiSyncService: StrapiSyncService = StrapiSyncService.getInstance();

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

      // Check if course already has a valid Strapi ID (not a temporary one)
      if (course.strapiId && !course.strapiId.startsWith('temp-')) {
        logger.info(`Course ${course._id} already has a valid Strapi ID: ${course.strapiId}`);
      } 
      // Only attempt to update the Strapi ID if it's a temporary one
      else if (course.strapiId && course.strapiId.startsWith('temp-')) {
        // Use a background task to update the Strapi ID without blocking the response
        // This prevents duplicate messages by not creating a new course in Strapi
        setTimeout(async () => {
          try {
            // Check if course exists in Strapi by code before creating a new one
            const existingCourses = await CourseController.strapiSyncService.searchCourses(course.code);
            const exactMatch = existingCourses.find((strapiCourse: any) => 
              strapiCourse.attributes && strapiCourse.attributes.code === course.code
            );
            
            if (exactMatch) {
              // If course already exists in Strapi, update MongoDB with the existing Strapi ID
              const updateData: ICourseUpdateData = { strapiId: exactMatch.id.toString() };
              await CourseService.updateCourse(course._id.toString(), updateData, userId);
              logger.info(`Updated course ${course._id} with existing Strapi ID ${exactMatch.id}`);
            }
            // We don't need an else clause here since CourseService already attempted to create in Strapi
          } catch (error) {
            logger.error(`Background Strapi ID check failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }, 100);
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
            country: course.country,
            organisation: course.organisation,
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

      // If course has a Strapi ID, update in Strapi
      if (updatedCourse.strapiId) {
        try {
          // Prepare data for Strapi update - define with an index signature
          const strapiUpdateData: Record<string, any> = {
            name: updatedCourse.name,
            code: updatedCourse.code,
            courseLevel: updatedCourse.level,
            startDate: updatedCourse.startDate,
            endDate: updatedCourse.endDate,
            isActive: updatedCourse.isActive,
            country: updatedCourse.country || 'Unknown',
            organisation: updatedCourse.organisation || ''
          };

          // Add optional fields if present in the update
          if ('description' in updateData) {
            strapiUpdateData.description = updateData.description;
          }
          if ('expectedEnrollment' in updateData) {
            strapiUpdateData.expectedEnrollment = updateData.expectedEnrollment;
          }
          if ('targetIndustryPartnership' in updateData) {
            strapiUpdateData.targetIndustryPartnership = updateData.targetIndustryPartnership;
          }
          if ('preferredPartnerRepresentative' in updateData) {
            strapiUpdateData.preferredPartnerRepresentative = updateData.preferredPartnerRepresentative;
          }

          // Update in Strapi
          await CourseController.requestResponseService.updateCourse(
            updatedCourse.strapiId,
            strapiUpdateData,
            userId
          );
          
          logger.info(`Updated course in Strapi with ID ${updatedCourse.strapiId}`);
        } catch (strapiError) {
          logger.error(`Failed to update course in Strapi: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
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
      // Get course before deletion to check for strapiId
      const course = await CourseService.getCourseById(courseId);

      if (!course) {
        return res.status(404).json({
          status: 'error',
          message: 'Course not found'
        });
      }

      // Delete from MongoDB first
      const result = await CourseService.deleteCourse(courseId, userId);

      if (!result) {
        return res.status(400).json({
          status: 'error',
          message: 'Failed to delete course'
        });
      }

      // If course has a Strapi ID, delete from Strapi
      if (course.strapiId) {
        try {
          await CourseController.requestResponseService.deleteCourse(course.strapiId, userId);
          logger.info(`Deleted course from Strapi with ID ${course.strapiId}`);
        } catch (strapiError) {
          logger.error(`Failed to delete course in Strapi: ${strapiError instanceof Error ? strapiError.message : String(strapiError)}`);
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
      // Update course status
      const updatedCourse = await CourseService.setCourseActiveStatus(courseId, isActive, userId);

      // Update in Strapi
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
    } catch (error) {
      logger.error(`Error updating course status: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Synchronize course with Strapi
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

    try {
      // Get the course to sync
      const course = await CourseService.getCourseById(courseId);
      
      if (!course) {
        return res.status(404).json({
          status: 'error',
          message: 'Course not found'
        });
      }

      // Prepare Strapi data
      const strapiData = {
        name: course.name,
        code: course.code,
        userId: course.creatorUserId,
        courseLevel: course.level,
        startDate: course.startDate,
        endDate: course.endDate,
        isActive: course.isActive,
        country: course.country || 'Unknown',
        organisation: course.organisation || ''
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