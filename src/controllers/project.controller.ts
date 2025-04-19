// src/controllers/project.controller.ts
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { asyncHandler } from '../middlewares/error.middleware';
import { ProjectService } from '../services/project.service';
import { createLogger } from '../config/logger';
import { EventPublisher } from '../services/event.publisher';
import { EventType } from '../models/events.model';
import { ApiError } from '../middlewares/error.middleware';
import { Project } from '../models/project.model';

const logger = createLogger('ProjectController');

/**
 * Controller for project-related operations
 * Implements the adapter pattern between HTTP requests and service layer
 * Uses MongoDB as the single source of truth for project data
 */
export class ProjectController {
  private static eventPublisher: EventPublisher = EventPublisher.getInstance();

  /**
   * Create a new project
   * @route POST /api/projects
   */
  public static createProject = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    // Validate request using express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const projectData = req.body;
    const { userId } = req.user; // Assuming auth middleware attaches user info

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User ID is required to create a project'
      });
    }

    try {
      // Map request fields to our model fields
      const mappedProjectData = {
        creator: userId,
        title: projectData.title,
        shortDescription: projectData.shortDescription,
        detailedDescription: projectData.detailedDescription,
        aim: projectData.aim,
        potentialSolution: projectData.potentialSolution,
        additionalInformation: projectData.additionalInformation,
        targetAcademicPartnership: projectData.targetAcademicPartnership,
        studentLevel: projectData.studentLevel,
        country: projectData.country,
        organisation: projectData.organisation,
        startDate: projectData.startDate,
        endDate: projectData.endDate
      };

      // Create project in MongoDB (our source of truth)
      const project = await ProjectService.createProject(mappedProjectData);

      // Publish project creation event to RabbitMQ asynchronously
      try {
        await ProjectController.eventPublisher.publishProjectEvent(
          EventType.PROJECT_CREATED,
          {
            projectId: project._id.toString(),
            title: project.name,
            shortDescription: project.shortDescription || '',
            creatorUserId: project.userId,
            studentLevel: project.studentLevel,
            startDate: project.startDate,
            endDate: project.endDate,
            country: project.country,
            organisation: project.organisation || ''
          }
        );
        logger.info(`Published PROJECT_CREATED event for project ${project._id}`);
      } catch (eventError) {
        logger.error(`Error publishing project creation event: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
      }

      // Return success response
      return res.status(201).json({
        status: 'success',
        data: {
          project: {
            id: project._id,
            name: project.name,
            shortDescription: project.shortDescription,
            detailDescription: project.detailDescription,
            studentLevel: project.studentLevel,
            startDate: project.startDate,
            endDate: project.endDate,
            country: project.country,
            organisation: project.organisation,
            isActive: project.isActive,
            createdAt: project.createdAt,
            // Add other fields as needed
          }
        }
      });
    } catch (error) {
      logger.error(`Error creating project: ${error instanceof Error ? error.message : String(error)}`);
      throw error; // Let the error middleware handle it
    }
  });

  /**
   * Get a project by ID
   * @route GET /api/projects/:projectId
   */
  public static getProjectById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        status: 'error',
        message: 'Project ID is required'
      });
    }

    try {
      const project = await ProjectService.getProjectById(projectId);

      if (!project) {
        return res.status(404).json({
          status: 'error',
          message: `Project with ID ${projectId} not found`
        });
      }
      
      // Get the creator's user information
      const creator = await ProjectService.getCreatorDetails(project.userId);

      return res.status(200).json({
        status: 'success',
        data: {
          project,
          creator: creator ? {
            prefix: creator.prefix,
            firstName: creator.firstName,
            lastName: creator.lastName,
            email: creator.email,
            organisation: creator.organisation
          } : null
        }
      });
    } catch (error) {
      logger.error(`Error getting project: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Update a project (supports partial updates with any fields)
   * @route PUT /api/projects/:projectId
   * @route PATCH /api/projects/:projectId
   */
  public static updateProject = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { projectId } = req.params;
    const updateData = req.body;
    const { userId } = req.user; // From auth middleware

    if (!projectId) {
      return res.status(400).json({
        status: 'error',
        message: 'Project ID is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No update data provided'
      });
    }

    try {
      // Check if project exists
      const existingProject = await ProjectService.getProjectById(projectId);
      
      if (!existingProject) {
        return res.status(404).json({
          status: 'error',
          message: 'Project not found'
        });
      }

      // Update in MongoDB (our source of truth)
      const updatedProject = await ProjectService.updateProject(projectId, updateData, userId);

      // Publish project update event asynchronously
      try {
        await ProjectController.eventPublisher.publishProjectEvent(
          EventType.PROJECT_UPDATED,
          {
            projectId: updatedProject._id.toString(),
            title: updatedProject.name,
            shortDescription: updatedProject.shortDescription || '',
            creatorUserId: updatedProject.userId,
            studentLevel: updatedProject.studentLevel,
            startDate: updatedProject.startDate,
            endDate: updatedProject.endDate,
            country: updatedProject.country,
            organisation: updatedProject.organisation || ''
          }
        );
        logger.info(`Published PROJECT_UPDATED event for project ${updatedProject._id}`);
      } catch (eventError) {
        logger.error(`Error publishing project update event: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
      }

      return res.status(200).json({
        status: 'success',
        data: {
          project: updatedProject
        }
      });
    } catch (error) {
      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes('Permission denied')) {
          throw new ApiError(403, error.message);
        } else if (error.message.includes('not found')) {
          throw new ApiError(404, error.message);
        } else if (error.message.includes('start date') || error.message.includes('end date')) {
          throw new ApiError(400, error.message);
        }
      }
      throw error; // Let the error middleware handle general errors
    }
  });

  /**
   * Delete a project
   * @route DELETE /api/projects/:projectId
   */
  public static deleteProject = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { projectId } = req.params;
    const { userId } = req.user; // From auth middleware
    const { force } = req.query; // Optional force parameter to bypass partnership checks

    if (!projectId) {
      return res.status(400).json({
        status: 'error',
        message: 'Project ID is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    try {
      // Get project before deletion for event publishing
      const project = await ProjectService.getProjectById(projectId);

      if (!project) {
        return res.status(404).json({
          status: 'error',
          message: 'Project not found'
        });
      }

      // Delete from MongoDB
      const result = await ProjectService.deleteProject(projectId, userId, force === 'true');

      if (!result) {
        return res.status(400).json({
          status: 'error',
          message: 'Failed to delete project'
        });
      }

      // Publish project deletion event asynchronously
      try {
        await ProjectController.eventPublisher.publishProjectEvent(
          EventType.PROJECT_DELETED,
          {
            projectId: projectId,
            title: project.name,
            shortDescription: project.shortDescription || '',
            creatorUserId: project.userId,
            studentLevel: project.studentLevel,
            startDate: project.startDate,
            endDate: project.endDate,
            country: project.country,
            organisation: project.organisation || ''
          }
        );
        logger.info(`Published PROJECT_DELETED event for project ${projectId}`);
      } catch (eventError) {
        logger.error(`Error publishing project deletion event: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
      }

      return res.status(200).json({
        status: 'success',
        message: 'Project deleted successfully',
        data: {
          projectId: projectId
        }
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
   * Get projects by student level
   * @route GET /api/projects/student-level/:studentLevel
   */
  public static getProjectsByStudentLevel = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { studentLevel } = req.params;

    if (!studentLevel) {
      return res.status(400).json({
        status: 'error',
        message: 'Student level parameter is required'
      });
    }

    try {
      const projects = await ProjectService.getProjectsByStudentLevel(studentLevel);

      return res.status(200).json({
        status: 'success',
        data: {
          projects,
          count: projects.length,
          studentLevel
        }
      });
    } catch (error) {
      logger.error(`Error fetching projects by student level: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get projects by organisation
   * @route GET /api/projects/organisation/:organisation
   */
  public static getProjectsByOrganisation = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { organisation } = req.params;

    if (!organisation) {
      return res.status(400).json({
        status: 'error',
        message: 'Organisation parameter is required'
      });
    }

    try {
      const projects = await ProjectService.getProjectsByOrganisation(organisation);

      return res.status(200).json({
        status: 'success',
        data: {
          projects,
          count: projects.length,
          organisation
        }
      });
    } catch (error) {
      logger.error(`Error fetching projects by organisation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get projects by country
   * @route GET /api/projects/country/:country
   */
  public static getProjectsByCountry = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { country } = req.params;

    if (!country) {
      return res.status(400).json({
        status: 'error',
        message: 'Country parameter is required'
      });
    }

    try {
      const projects = await ProjectService.getProjectsByCountry(country);

      return res.status(200).json({
        status: 'success',
        data: {
          projects,
          count: projects.length,
          country
        }
      });
    } catch (error) {
      logger.error(`Error fetching projects by country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get projects by creator
   * @route GET /api/projects/user/:userId
   */
  public static getProjectsByCreator = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }

    try {
      const projects = await ProjectService.getProjectsByCreator(userId);

      return res.status(200).json({
        status: 'success',
        data: {
          projects,
          count: projects.length,
          userId
        }
      });
    } catch (error) {
      logger.error(`Error fetching projects by creator: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
  
  /**
   * Get projects by user ID with pagination and filtering
   * @route GET /api/projects/user-projects/:userId
   */
  public static getProjectsByUserId = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = req.params;
    const { page, limit, studentLevel, status } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID is required'
      });
    }
    
    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;
    
    // Build filter object with additional filters if provided
    const filters: any = {};
    
    if (studentLevel) {
      filters.studentLevel = studentLevel;
    }
    
    if (status) {
      filters.status = status;
    }

    try {
      // Get projects by the specified user ID with pagination
      const result = await ProjectService.getProjectsByUserId(userId, pageNum, limitNum, filters);

      return res.status(200).json({
        status: 'success',
        data: {
          projects: result.projects,
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
      logger.error(`Error fetching projects by user ID: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Set project active status
   * @route PATCH /api/projects/:projectId/status
   */
  public static setProjectActiveStatus = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { projectId } = req.params;
    const { isActive } = req.body;
    const { userId } = req.user; // From auth middleware

    if (!projectId) {
      return res.status(400).json({
        status: 'error',
        message: 'Project ID is required'
      });
    }

    if (isActive === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'isActive status is required'
      });
    }

    try {
      // Update project status in MongoDB
      const updatedProject = await ProjectService.setProjectActiveStatus(projectId, isActive, userId);

      // Publish project update event
      try {
        await ProjectController.eventPublisher.publishProjectEvent(
          EventType.PROJECT_UPDATED,
          {
            projectId: updatedProject._id.toString(),
            title: updatedProject.name,
            shortDescription: updatedProject.shortDescription || '',
            creatorUserId: updatedProject.userId,
            studentLevel: updatedProject.studentLevel,
            startDate: updatedProject.startDate,
            endDate: updatedProject.endDate,
            country: updatedProject.country,
            organisation: updatedProject.organisation || ''
          }
        );
        logger.info(`Published PROJECT_UPDATED event for project ${updatedProject._id} (status change)`);
      } catch (eventError) {
        logger.error(`Error publishing project update event: ${eventError instanceof Error ? eventError.message : String(eventError)}`);
      }

      return res.status(200).json({
        status: 'success',
        data: {
          project: updatedProject
        }
      });
    } catch (error) {
      logger.error(`Error updating project status: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get all projects with pagination and filtering
   * @route GET /api/projects
   */
  public static getProjects = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { 
      studentLevel, 
      isActive, 
      country, 
      organisation, 
      page, 
      limit,
      targetAcademicPartnership,
      status
    } = req.query;
    
    const filters: any = {};

    // Build filters based on query parameters
    if (studentLevel) {
      filters.studentLevel = studentLevel;
    }

    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }

    if (country) {
      filters.country = country;
    }
    
    if (organisation) {
      filters.organisation = organisation;
    }

    if (targetAcademicPartnership) {
      filters.targetAcademicPartnership = targetAcademicPartnership;
    }

    if (status) {
      filters.status = status;
    }

    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;

    // Get paginated projects with filters
    const result = await ProjectService.getPaginatedProjects(pageNum, limitNum, filters);

    return res.status(200).json({
      status: 'success',
      data: {
        projects: result.projects,
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
   * Get a list of projects with specific fields
   * @route GET /api/projects/list
   */
  public static getProjectsList = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { 
      studentLevel, 
      organisation, 
      status,
      targetAcademicPartnership, 
      page, 
      limit 
    } = req.query;
    
    const filters: any = {};

    // Build filters based on query parameters
    if (studentLevel) {
      filters.studentLevel = studentLevel;
    }

    if (organisation) {
      filters.organisation = organisation;
    }

    if (status) {
      filters.status = status;
    }

    if (targetAcademicPartnership) {
      filters.targetAcademicPartnership = targetAcademicPartnership;
    }

    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;

    try {
      // Get projects with specific fields
      const projects = await Project.find(filters)
        .select('name studentLevel organisation startDate endDate status targetAcademicPartnership shortDescription')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);
      
      // Get total count for pagination
      const total = await Project.countDocuments(filters);
      
      // Calculate total pages
      const pages = Math.ceil(total / limitNum);

      return res.status(200).json({
        status: 'success',
        data: {
          projects,
          pagination: {
            total,
            pages,
            page: pageNum,
            limit: limitNum
          }
        }
      });
    } catch (error) {
      logger.error(`Error fetching projects list: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Get filtered projects by specific field values with pagination
   * @route GET /api/projects/filter
   */
  public static getFilteredProjects = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { page, limit, studentLevel, country, organisation, isActive, status, targetAcademicPartnership } = req.query;
    
    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;
    
    // Build filter object based on provided query parameters
    const filters: any = {};
    
    if (studentLevel) {
      filters.studentLevel = studentLevel;
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
    
    if (targetAcademicPartnership) {
      filters.targetAcademicPartnership = targetAcademicPartnership;
    }

    try {
      // Get filtered projects with pagination
      const result = await ProjectService.getFilteredProjectsList(pageNum, limitNum, filters);

      return res.status(200).json({
        status: 'success',
        data: {
          projects: result.projects,
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
      logger.error(`Error fetching filtered projects: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  /**
   * Search projects 
   * @route GET /api/projects/search
   */
  public static searchProjects = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
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
      let projects;
      if (q) {
        projects = await ProjectService.searchProjects(q as string, limitNum, filters);
      } else {
        projects = await ProjectService.getPaginatedProjects(1, limitNum, filters);
        projects = projects.projects; // Extract the projects array from the result
      }

      return res.status(200).json({
        status: 'success',
        data: {
          projects,
          count: projects.length,
          searchParams: { q, country, organisation }
        }
      });
    } catch (error) {
      logger.error(`Error searching projects: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
  
  /**
   * Get projects grouped by user's country
   * @route GET /api/projects/by-location
   */
  public static getProjectsByUserLocation = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { studentLevel, isActive, organisation, page, limit, targetAcademicPartnership, status } = req.query;
    const userId = req.user?.userId; // Get userId from authenticated user if available
    const userCountry = req.user?.country; // Get user's country from authentication context
    
    if (!userCountry) {
      return res.status(400).json({
        status: 'error',
        message: 'User country information is required for location-based grouping'
      });
    }
    
    const filters: any = {};

    // Build filters based on query parameters
    if (studentLevel) {
      filters.studentLevel = studentLevel;
    }

    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    
    if (organisation) {
      filters.organisation = organisation;
    }

    if (targetAcademicPartnership) {
      filters.targetAcademicPartnership = targetAcademicPartnership;
    }

    if (status) {
      filters.status = status;
    }

    // Parse pagination parameters
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const limitNum = limit ? parseInt(limit as string, 10) : 10;

    try {
      // Get filtered projects list
      const result = await ProjectService.getFilteredProjectsList(pageNum, limitNum, filters);
      
      // Group projects by user's country
      const local = result.projects.filter(project => project.country === userCountry);
      const overseas = result.projects.filter(project => project.country !== userCountry);
      
      logger.info(`Grouped projects by user country ${userCountry}: ${local.length} local, ${overseas.length} overseas`);
      
      return res.status(200).json({
        status: 'success',
        data: {
          projects: {
            local,
            overseas
          },
          pagination: {
            total: result.total,
            pages: result.pages,
            page: pageNum,
            limit: limitNum
          },
          userCountry
        }
      });
    } catch (error) {
      logger.error(`Error getting projects by user location: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
}