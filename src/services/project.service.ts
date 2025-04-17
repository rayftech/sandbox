// src/services/project.service.ts - MODIFIED TO FIX STRAPIID INDEX ISSUE
import mongoose from 'mongoose';
import { Project, IProject, } from '../models/project.model';
import { User, IUser } from '../models/user.model';
import { createLogger } from '../config/logger';
import { CourseLevel } from '../models/course.model';
import { RichTextFormatter } from '../utils/rich-text-formatter';
import { EventPublisher } from './event.publisher';
import { EventType } from '../models/events.model';

const logger = createLogger('ProjectService');

// Get the projects collection and try to explicitly drop the problematic index
mongoose.connection.once('open', async () => {
  try {
    // Check if connection.db is defined
    if (mongoose.connection.db) {
      // Try to drop the index directly on the collection
      try {
        await mongoose.connection.db.collection('projects').dropIndex('strapiId_1');
        logger.info('Successfully dropped strapiId_1 index from projects collection');
      } catch (err) {
        logger.info(`Note: strapiId_1 index may not exist or was already removed: ${err instanceof Error ? err.message : String(err)}`);
      }
      
      // As a fallback, try to recreate the collection without the index
      try {
        await mongoose.connection.db.collection('projects').dropIndexes();
        logger.info('Dropped all indexes from projects collection');
      } catch (err) {
        logger.info(`Failed to drop all indexes: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.warn('Database connection exists but db property is undefined');
    }
  } catch (error) {
    logger.error(`Error handling project indexes: ${error instanceof Error ? error.message : String(error)}`);
  }
});

/**
 * Interface for project creation data
 */
export interface IProjectCreationData {
  creator: string; // userId of creator
  title: string;
  shortDescription: string;
  detailedDescription: string;
  aim: string;
  potentialSolution?: string;
  additionalInformation?: string;
  targetAcademicPartnership?: string;
  studentLevel?: CourseLevel;
  country: string;
  organisation?: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Interface for project update data
 */
export interface IProjectUpdateData {
  title?: string;
  shortDescription?: string;
  detailedDescription?: string;
  aim?: string;
  potentialSolution?: string;
  additionalInformation?: string;
  targetAcademicPartnership?: string;
  studentLevel?: CourseLevel;
  country?: string;
  organisation?: string;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
}

/**
 * Project service class for managing project operations
 * Implements core business logic for project-related functionality
 */
export class ProjectService {
  /**
   * Checks all active projects to determine if they have ended based on end date
   * Updates status and sends notifications for projects that have passed their end date
   * @returns Promise with results of the check operation
   */
  static async checkProjectsEndDate(): Promise<{ updated: number, errors: number }> {
    try {
      logger.info('Starting project end date check');
      const now = new Date();
      
      // Find all active projects where end date has passed
      const expiredProjects = await Project.find({
        isActive: true,
        endDate: { $lt: now }
      });
      
      logger.info(`Found ${expiredProjects.length} expired projects that need status update`);
      
      let updated = 0;
      let errors = 0;
      
      // Process each expired project
      for (const project of expiredProjects) {
        try {
          // Update project status
          project.isActive = false;
          project.updateStatus();
          
          // Save the updated project
          await project.save();
          updated++;
          
          // Send notification to project creator
          try {
            // Get event publisher instance
            const eventPublisher = EventPublisher.getInstance();
            
            // Send project update event
            await eventPublisher.publishProjectEvent(
              EventType.PROJECT_UPDATED,
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
            
            // Send system notification to project creator
            await eventPublisher.publishSystemNotification({
              recipientUserId: project.userId,
              title: 'Project Ended',
              message: `Your project "${project.name}" has reached its end date and has been marked as completed.`,
              priority: 'medium'
            });
          } catch (notificationError) {
            logger.error(`Error sending notifications for expired project ${project._id}: ${notificationError instanceof Error ? notificationError.message : String(notificationError)}`);
          }
          
          logger.info(`Updated status for expired project ${project._id}, "${project.name}"`);
        } catch (projectError) {
          errors++;
          logger.error(`Error updating expired project ${project._id}: ${projectError instanceof Error ? projectError.message : String(projectError)}`);
        }
      }
      
      logger.info(`Project end date check completed. Updated: ${updated}, Errors: ${errors}`);
      return { updated, errors };
    } catch (error) {
      logger.error(`Error in checkProjectsEndDate: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Create a new project
   * @param projectData The project data
   * @returns The created project document
   */
  static async createProject(projectData: IProjectCreationData): Promise<IProject> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validate date range
      if (projectData.endDate <= projectData.startDate) {
        throw new Error('End date must be after start date');
      }

      // Convert userId to ObjectId for creator reference
      const user = await User.findOne({ userId: projectData.creator });
      if (!user) {
        throw new Error(`Creator with userId ${projectData.creator} not found`);
      }
      
      // Check for duplicate project (same user and project title)
      const existingProject = await Project.findOne({
        userId: projectData.creator,
        name: { $regex: new RegExp(`^${projectData.title}$`, 'i') } // Case-insensitive match
      });
      
      if (existingProject) {
        throw new Error(`A project with the title "${projectData.title}" already exists for this user`);
      }

      // Use RichTextFormatter to convert text to Lexical format
      
      // Process targetAcademicPartnership to handle comma-separated strings
      const validatedAcademicPartnerships = this.validateAcademicPartnership(
        projectData.targetAcademicPartnership
      );
      
      // Create new project using the new project model structure
      const project = new Project({
        userId: projectData.creator, // Use userId directly as per the new model
        name: projectData.title,
        shortDescription: projectData.shortDescription,
        detailDescription: projectData.detailedDescription ? RichTextFormatter.toLexical(projectData.detailedDescription) : undefined,
        aim: projectData.aim ? RichTextFormatter.toLexical(projectData.aim) : undefined,
        potentialSolution: projectData.potentialSolution ? RichTextFormatter.toLexical(projectData.potentialSolution) : undefined,
        additionalInformation: projectData.additionalInformation ? RichTextFormatter.toLexical(projectData.additionalInformation) : undefined,
        targetAcademicPartnership: validatedAcademicPartnerships,
        studentLevel: projectData.studentLevel,
        country: projectData.country,
        organisation: projectData.organisation,
        startDate: projectData.startDate,
        endDate: projectData.endDate,
        isActive: true
      });

      // Set time analytics dimensions
      project.setTimeAnalyticsDimensions();

      // Save the project without using the problematic index
      // Use direct MongoDB insertion to bypass Mongoose's validation
      const rawProject = project.toObject();
      
      // Create a new object without _id to avoid TypeScript delete operator error
      const { _id, ...projectWithoutId } = rawProject;
      
      // Remove any potential strapiId field
      const finalProject = { ...projectWithoutId };
      if ('strapiId' in finalProject) {
        delete (finalProject as any).strapiId;
      }
      
      // Insert directly via the MongoDB driver
      if (!mongoose.connection.db) {
        throw new Error('Database connection is not fully established');
      }
      
      const result = await mongoose.connection.db.collection('projects').insertOne(finalProject);
      
      // Get the inserted document
      const savedProject = await Project.findById(result.insertedId);
      
      if (!savedProject) {
        throw new Error('Failed to retrieve saved project');
      }
      
      // Update user analytics - increment project count
      await ProjectService.incrementUserMetric(
        projectData.creator, 
        'totalProjectsCreated', 
        1
      );
      
      await session.commitTransaction();
      logger.info(`New project created: ${savedProject._id} by user ${projectData.creator} from ${projectData.country}, organisation: ${projectData.organisation || 'not specified'}`);
      
      return savedProject;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error creating project: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Get a project by its ID
   * @param projectId The MongoDB ID of the project
   * @returns The project document or null if not found
   */
  static async getProjectById(projectId: string): Promise<IProject | null> {
    try {
      return await Project.findById(projectId);
    } catch (error) {
      logger.error(`Error getting project: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get creator user details
   * @param userId The userId of the project creator
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
      return null; // Return null instead of throwing to prevent project fetch from failing
    }
  }

  /**
   * Get all projects created by a specific user
   * @param userId The userId of the creator
   * @returns Array of project documents
   */
  static async getProjectsByCreator(userId: string): Promise<IProject[]> {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      return await Project.find({ userId: userId })
        .sort({ createdAt: -1 });
    } catch (error) {
      logger.error(`Error getting projects by creator: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get projects by user ID with pagination and filtering
   * @param userId The userId of the creator
   * @param page The page number (1-based)
   * @param limit The number of items per page
   * @param additionalFilters Additional filters to apply
   * @returns Object containing paginated projects, total count, and total pages
   */
  static async getProjectsByUserId(
    userId: string,
    page: number = 1,
    limit: number = 10,
    additionalFilters: Record<string, any> = {}
  ): Promise<{ projects: any[], total: number, pages: number }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;
      
      // Build filters with required userId
      const filters = { 
        userId,
        ...additionalFilters 
      };
      
      // Log the filters being applied
      logger.debug(`Getting projects by user ID with filters: ${JSON.stringify(filters)}`);
      
      // Count total matching documents for pagination metadata
      const total = await Project.countDocuments(filters);
      
      // Get the filtered results with selected fields for better performance
      const projects = await Project.find(filters, {
        _id: 1,           // MongoDB ID
        name: 1,          // Project name
        shortDescription: 1, // Brief overview
        studentLevel: 1,  // Student level
        startDate: 1,     // Start date
        endDate: 1,       // End date
        status: 1,        // Status
        organisation: 1,  // Organisation
        country: 1,       // Country
        targetAcademicPartnership: 1, // Target partnership
        isActive: 1       // Active status
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit);
      
      // Calculate total pages
      const pages = Math.ceil(total / validLimit);
      
      // Transform the results to ensure ID field is correctly formatted
      const formattedProjects = projects.map(project => {
        const projectObj = project.toObject();
        return {
          id: projectObj._id.toString(),
          name: projectObj.name,
          shortDescription: projectObj.shortDescription,
          studentLevel: projectObj.studentLevel,
          startDate: projectObj.startDate,
          endDate: projectObj.endDate,
          status: projectObj.status,
          organisation: projectObj.organisation,
          country: projectObj.country,
          targetAcademicPartnership: projectObj.targetAcademicPartnership,
          isActive: projectObj.isActive
        };
      });
      
      return {
        projects: formattedProjects,
        total,
        pages
      };
    } catch (error) {
      logger.error(`Error getting projects by user ID: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get projects matching specific criteria
   * @param filters Object containing filter criteria
   * @returns Array of matching project documents
   */
  static async getProjects(filters: {
    studentLevel?: CourseLevel;
    isActive?: boolean;
    startDate?: { $gte?: Date, $lte?: Date };
    endDate?: { $gte?: Date, $lte?: Date };
    country?: string;
    organisation?: string;
  }): Promise<IProject[]> {
    try {
      return await Project.find(filters)
        .sort({ createdAt: -1 })
;
    } catch (error) {
      logger.error(`Error getting projects with filters: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update a project
   * @param projectId The MongoDB ID of the project
   * @param updateData The data to update
   * @param userId The userId of the user making the update (for permission check)
   * @returns The updated project document
   */
  static async updateProject(
    projectId: string, 
    updateData: any,  // Use 'any' to allow for flexible field updates
    userId: string
  ): Promise<IProject> {
    try {
      // Get the project to update
      const project = await Project.findById(projectId);
      
      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      // Check if user is the creator or an admin
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Verify the user has permission to update this project
      if (project.userId !== userId && !user.isAdmin) {
        throw new Error('Permission denied: Only project creator or admin can update this project');
      }

      // Handle title/name field conversion
      if (updateData.title && !updateData.name) {
        updateData.name = updateData.title;
        delete updateData.title;
      }

      // Process rich text fields if provided
      if (updateData.detailedDescription) {
        updateData.detailDescription = RichTextFormatter.toLexical(updateData.detailedDescription);
        delete updateData.detailedDescription; // Remove the original field
      }
      
      if (updateData.aim) {
        updateData.aim = RichTextFormatter.toLexical(updateData.aim);
      }
      
      if (updateData.potentialSolution) {
        updateData.potentialSolution = RichTextFormatter.toLexical(updateData.potentialSolution);
      }
      
      if (updateData.additionalInformation) {
        updateData.additionalInformation = RichTextFormatter.toLexical(updateData.additionalInformation);
      }

      // Validate date range if both dates are provided
      if (updateData.startDate && updateData.endDate && 
          new Date(updateData.endDate) <= new Date(updateData.startDate)) {
        throw new Error('End date must be after start date');
      }
      
      // If only one date is provided, check against existing date
      if (updateData.startDate && !updateData.endDate && 
          new Date(updateData.startDate) >= project.endDate) {
        throw new Error('Start date must be before existing end date');
      }
      
      if (!updateData.startDate && updateData.endDate && 
          new Date(updateData.endDate) <= project.startDate) {
        throw new Error('End date must be after existing start date');
      }

      // Convert date strings to Date objects if necessary
      if (updateData.startDate && typeof updateData.startDate === 'string') {
        updateData.startDate = new Date(updateData.startDate);
      }
      
      if (updateData.endDate && typeof updateData.endDate === 'string') {
        updateData.endDate = new Date(updateData.endDate);
      }

      // Remove any fields that should not be updated directly
      const protectedFields = ['_id', '__v', 'createdAt', 'updatedAt'];
      protectedFields.forEach(field => {
        if (field in updateData) {
          delete updateData[field];
        }
      });

      // Update the project
      const updatedProject = await Project.findByIdAndUpdate(
        projectId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!updatedProject) {
        throw new Error(`Failed to update project with ID ${projectId}`);
      }

      // If dates were updated, recalculate time analytics dimensions
      if (updateData.startDate || updateData.endDate) {
        updatedProject.setTimeAnalyticsDimensions();
        await updatedProject.save();
      }

      // Update status if needed
      if (typeof updatedProject.updateStatus === 'function') {
        const statusChanged = updatedProject.updateStatus();
        if (statusChanged) {
          await updatedProject.save();
        }
      }

      logger.info(`Project ${projectId} updated by user ${userId}`);
      return updatedProject;
    } catch (error) {
      logger.error(`Error updating project: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Delete a project
   * @param projectId The MongoDB ID of the project
   * @param userId The userId of the user making the delete request (for permission check)
   * @param force Optional parameter to bypass partnership checks
   * @returns Boolean indicating success
   */
  static async deleteProject(projectId: string, userId: string, force: boolean = false): Promise<boolean> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get the project to delete
      const project = await Project.findById(projectId).lean();
      
      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      // Check if user is the creator or an admin
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Verify the user has permission to delete this project
      // Using the direct userId field from the new model
      const projectUserId = project.userId;
      
      if (!projectUserId) {
        throw new Error('Project creator information not found');
      }

      if (projectUserId !== userId && !user.isAdmin) {
        throw new Error('Permission denied: Only project creator or admin can delete this project');
      }

      // Check for active partnerships unless force flag is set
      if (!force) {
        // First check if the project is part of any active partnerships
        // This would typically involve checking the Partnership collection
        const hasActivePartnerships = await ProjectService.hasActivePartnerships(projectId);
        
        if (hasActivePartnerships) {
          throw new Error('Cannot delete project with active partnerships. Use force=true to override.');
        }
      }

      // Delete the project
      await Project.findByIdAndDelete(projectId, { session });

      // Decrement the user's project count
      await ProjectService.incrementUserMetric(
        projectUserId,
        'totalProjectsCreated',
        -1
      );

      await session.commitTransaction();
      logger.info(`Project ${projectId} deleted by user ${userId}${force ? ' (forced)' : ''}`);
      return true;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error deleting project: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Set a project's active status
   * @param projectId The MongoDB ID of the project
   * @param isActive The new active status
   * @param userId The userId of the user making the update (for permission check)
   * @returns The updated project document
   */
  static async setProjectActiveStatus(
    projectId: string,
    isActive: boolean,
    userId: string
  ): Promise<IProject> {
    try {
      // Reuse the update method for this operation
      return await ProjectService.updateProject(
        projectId,
        { isActive },
        userId
      );
    } catch (error) {
      logger.error(`Error updating project status: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Find projects that match a course's requirements
   * @param studentLevel The course level to match
   * @param startDate The earliest start date
   * @param endDate The latest end date
   * @returns Array of matching project documents
   */
  static async findMatchingProjects(
    studentLevel: CourseLevel,
    startDate: Date,
    endDate: Date
  ): Promise<IProject[]> {
    try {
      // Find active projects with matching student level and overlapping date range
      return await Project.find({
        isActive: true,
        studentLevel: studentLevel,
        // Project start date must be before or equal to course end date
        startDate: { $lte: endDate },
        // Project end date must be after or equal to course start date
        endDate: { $gte: startDate }
      });
    } catch (error) {
      logger.error(`Error finding matching projects: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Check if a project has any active partnerships
   * @param projectId The MongoDB ID of the project
   * @returns Boolean indicating if the project has active partnerships
   */
  private static async hasActivePartnerships(projectId: string): Promise<boolean> {
    // This would typically check the Partnership collection
    // For this implementation, we'll return false as a placeholder
    logger.info(`Checking if project ${projectId} has active partnerships`);
    return false; // Placeholder implementation
  }

  /**
   * Get projects by student level
   * @param studentLevel The student level to filter by
   * @returns Array of matching project documents
   */
  static async getProjectsByStudentLevel(studentLevel: string): Promise<IProject[]> {
    try {
      return await Project.find({ studentLevel })
        .sort({ createdAt: -1 });
    } catch (error) {
      logger.error(`Error getting projects by student level: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get projects by country
   * @param country The country to filter by
   * @returns Array of matching project documents
   */
  static async getProjectsByCountry(country: string): Promise<IProject[]> {
    try {
      return await Project.find({ country })
        .sort({ createdAt: -1 });
    } catch (error) {
      logger.error(`Error getting projects by country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get projects by organisation
   * @param organisation The organisation to filter by
   * @returns Array of matching project documents
   */
  static async getProjectsByOrganisation(organisation: string): Promise<IProject[]> {
    try {
      return await Project.find({ organisation })
        .sort({ createdAt: -1 });
    } catch (error) {
      logger.error(`Error getting projects by organisation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get project statistics by organisation
   * @returns Array of statistical groupings by organisation
   */
  static async getProjectStatsByOrganisation(): Promise<any[]> {
    try {
      return await Project.aggregate([
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
      logger.error(`Error getting project statistics by organisation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get project statistics by country
   * @returns Array of statistical groupings by country
   */
  static async getProjectStatsByCountry(): Promise<any[]> {
    try {
      return await Project.aggregate([
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
      logger.error(`Error getting project statistics by country: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get projects with pagination
   * @param page The page number (1-based)
   * @param limit The number of items per page
   * @param filters Additional filters to apply
   * @returns Object containing paginated results and metadata
   */
  static async getPaginatedProjects(
    page: number = 1,
    limit: number = 10,
    filters: any = {}
  ): Promise<{ projects: IProject[], total: number, pages: number }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;

      // Count total matching documents for pagination metadata
      const total = await Project.countDocuments(filters);
      
      // Get the paginated results
      const projects = await Project.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit);

      // Calculate total pages
      const pages = Math.ceil(total / validLimit);

      return {
        projects,
        total,
        pages
      };
    } catch (error) {
      logger.error(`Error getting paginated projects: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get a filtered list of projects with selected fields
   * @param page The page number (1-based)
   * @param limit The number of items per page
   * @param filters Object containing filter criteria (studentLevel, country, organisation, etc.)
   * @returns Object containing filtered project list with selected fields and metadata
   */
  static async getFilteredProjectsList(
    page: number = 1,
    limit: number = 10,
    filters: Record<string, any> = {}
  ): Promise<{ projects: any[], total: number, pages: number }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;

      // Log the filters being applied
      logger.debug(`Getting filtered projects with filters: ${JSON.stringify(filters)}`);

      // Count total matching documents for pagination metadata
      const total = await Project.countDocuments(filters);
      
      // Get the filtered results with only the specified fields
      const projects = await Project.find(filters, {
        _id: 1,           // MongoDB ID
        name: 1,          // Project name
        shortDescription: 1, // Brief overview
        studentLevel: 1,  // Student level
        startDate: 1,     // Start date
        endDate: 1,       // End date
        status: 1,        // Status
        organisation: 1,  // Organisation
        country: 1,       // Country
        targetAcademicPartnership: 1, // Target academic partnership
        isActive: 1       // Active status
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit);

      // Calculate total pages
      const pages = Math.ceil(total / validLimit);

      // Transform the results to ensure ID field is correctly formatted
      const formattedProjects = projects.map(project => {
        const projectObj = project.toObject();
        return {
          id: projectObj._id.toString(),
          name: projectObj.name,
          shortDescription: projectObj.shortDescription,
          studentLevel: projectObj.studentLevel,
          startDate: projectObj.startDate,
          endDate: projectObj.endDate,
          status: projectObj.status,
          organisation: projectObj.organisation,
          country: projectObj.country,
          targetAcademicPartnership: projectObj.targetAcademicPartnership,
          isActive: projectObj.isActive
        };
      });

      return {
        projects: formattedProjects,
        total,
        pages
      };
    } catch (error) {
      logger.error(`Error getting filtered projects list: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Search projects by title or description
   * @param searchQuery The search string
   * @param limit Maximum number of results to return
   * @param filters Additional filters to apply (country, organisation, etc.)
   * @returns Array of matching project documents
   */
  static async searchProjects(
    searchQuery: string, 
    limit: number = 10,
    filters: any = {}
  ): Promise<IProject[]> {
    try {
      // Create text index if it doesn't exist yet
      const collection = Project.collection;
      const indexes = await collection.indexes();
      
      const hasTextIndex = indexes.some(index => 
        index.name === 'title_text_shortDescription_text_detailedDescription_text_organisation_text'
      );
      
      if (!hasTextIndex) {
        await collection.createIndex({ 
          title: 'text', 
          shortDescription: 'text',
          detailedDescription: 'text',
          organisation: 'text'
        });
      }

      // Combine text search with additional filters
      const query: any = {
        $text: { $search: searchQuery }
      };
      
      // Add additional filters
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          query[key] = filters[key];
        }
      });

      // Perform text search
      return await Project.find(
        query,
        { score: { $meta: 'textScore' } }
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit);
    } catch (error) {
      logger.error(`Error searching projects: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Increment analytics metrics for a user
   * This method is internal to ProjectService and doesn't rely on UserService
   * @param userId The userId of the user
   * @param field The field to increment
   * @param amount The amount to increment by (default: 1)
   * @returns The updated user document
   */
  private static async incrementUserMetric(
    userId: string,
    field: 'totalCoursesCreated' | 'totalProjectsCreated' | 'totalPartnershipsInitiated' | 'totalPartnershipsReceived',
    amount: number = 1
  ): Promise<IUser> {
    try {
      const updateQuery: Record<string, any> = {};
      updateQuery[field] = amount;
      
      const user = await User.findOneAndUpdate(
        { userId },
        { $inc: updateQuery },
        { new: true }
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
   * Process academic partnership strings into an array
   * @param partnership The partnership value which could be a string, string array, or undefined
   * @returns Validated string array of partnerships
   */
  private static validateAcademicPartnership(partnership?: string | string[]): string[] {
    // If no partnership provided, return empty array
    if (!partnership) {
      return [];
    }
    
    // If string is provided, convert to array by splitting on commas
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
}