// src/services/project.service.ts
import mongoose from 'mongoose';
import { Project, IProject } from '../models/project.model';
import { User, IUser } from '../models/user.model';
import { createLogger } from '../config/logger';
import { CourseLevel } from '../models/course.model';

const logger = createLogger('ProjectService');

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
  studentLevel: CourseLevel;
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

      // Create new project
      const project = new Project({
        creator: user._id, // Use the MongoDB _id, not the userId
        title: projectData.title,
        shortDescription: projectData.shortDescription,
        detailedDescription: projectData.detailedDescription,
        aim: projectData.aim,
        potentialSolution: projectData.potentialSolution,
        additionalInformation: projectData.additionalInformation,
        targetAcademicPartnership: projectData.targetAcademicPartnership,
        studentLevel: projectData.studentLevel,
        startDate: projectData.startDate,
        endDate: projectData.endDate,
        isActive: true
      });

      // Save the project
      const savedProject = await project.save({ session });
      
      // Update user analytics - increment project count
      await ProjectService.incrementUserMetric(
        projectData.creator, 
        'totalProjectsCreated', 
        1
      );
      
      await session.commitTransaction();
      logger.info(`New project created: ${savedProject._id} by user ${projectData.creator}`);
      
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
      return await Project.findById(projectId).populate('creator', 'userId firstName lastName email');
    } catch (error) {
      logger.error(`Error getting project: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
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

      return await Project.find({ creator: user._id })
        .sort({ createdAt: -1 })
        .populate('creator', 'userId firstName lastName email');
    } catch (error) {
      logger.error(`Error getting projects by creator: ${error instanceof Error ? error.message : String(error)}`);
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
  }): Promise<IProject[]> {
    try {
      return await Project.find(filters)
        .sort({ createdAt: -1 })
        .populate('creator', 'userId firstName lastName email');
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
    updateData: IProjectUpdateData, 
    userId: string
  ): Promise<IProject> {
    try {
      // Get the project to update
      const project = await Project.findById(projectId).lean();
      
      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      // Check if user is the creator or an admin
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }

      // Verify the user has permission to update this project
      // Use type assertion to safely access creator field
      const creatorId = (project as any).creator;
      const creatorUser = await User.findById(creatorId);
      
      if (!creatorUser) {
        throw new Error('Project creator not found');
      }

      if (creatorUser.userId !== userId && !user.isAdmin) {
        throw new Error('Permission denied: Only project creator or admin can update this project');
      }

      // Validate date range if both dates are provided
      if (updateData.startDate && updateData.endDate && 
          updateData.endDate <= updateData.startDate) {
        throw new Error('End date must be after start date');
      }
      
      // If only one date is provided, check against existing date
      if (updateData.startDate && !updateData.endDate && 
          updateData.startDate >= (project as any).endDate) {
        throw new Error('Start date must be before existing end date');
      }
      
      if (!updateData.startDate && updateData.endDate && 
          updateData.endDate <= (project as any).startDate) {
        throw new Error('End date must be after existing start date');
      }

      // Update the project
      const updatedProject = await Project.findByIdAndUpdate(
        projectId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!updatedProject) {
        throw new Error(`Failed to update project with ID ${projectId}`);
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
   * @returns Boolean indicating success
   */
  static async deleteProject(projectId: string, userId: string): Promise<boolean> {
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
      // Use type assertion to safely access creator field
      const creatorId = (project as any).creator;
      const creatorUser = await User.findById(creatorId);
      
      if (!creatorUser) {
        throw new Error('Project creator not found');
      }

      if (creatorUser.userId !== userId && !user.isAdmin) {
        throw new Error('Permission denied: Only project creator or admin can delete this project');
      }

      // First check if the project is part of any active partnerships
      // This would typically involve checking the Partnership collection
      const hasActivePartnerships = await ProjectService.hasActivePartnerships(projectId);
      
      if (hasActivePartnerships) {
        throw new Error('Cannot delete project with active partnerships');
      }

      // Delete the project
      await Project.findByIdAndDelete(projectId, { session });

      // Decrement the user's project count
      await ProjectService.incrementUserMetric(
        creatorUser.userId,
        'totalProjectsCreated',
        -1
      );

      await session.commitTransaction();
      logger.info(`Project ${projectId} deleted by user ${userId}`);
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
      }).populate('creator', 'userId firstName lastName email');
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
        .limit(validLimit)
        .populate('creator', 'userId firstName lastName email');

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
   * Search projects by title or description
   * @param searchQuery The search string
   * @param limit Maximum number of results to return
   * @returns Array of matching project documents
   */
  static async searchProjects(searchQuery: string, limit: number = 10): Promise<IProject[]> {
    try {
      // Create text index if it doesn't exist yet (ideally this would be in schema)
      const collection = Project.collection;
      const indexes = await collection.indexes();
      
      const hasTextIndex = indexes.some(index => 
        index.name === 'title_text_shortDescription_text_detailedDescription_text'
      );
      
      if (!hasTextIndex) {
        await collection.createIndex({ 
          title: 'text', 
          shortDescription: 'text',
          detailedDescription: 'text' 
        });
      }

      // Perform text search
      return await Project.find(
        { $text: { $search: searchQuery } },
        { score: { $meta: 'textScore' } }
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .populate('creator', 'userId firstName lastName email');
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
}