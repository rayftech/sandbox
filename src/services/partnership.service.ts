// src/services/partnership.service.ts
import mongoose from 'mongoose';
import { Partnership, IPartnership, PartnershipStatus } from '../models/partnership.model';
import { Course } from '../models/course.model';
import { Project } from '../models/project.model';
import { User } from '../models/user.model';
import { createLogger } from '../config/logger';

const logger = createLogger('PartnershipService');

/**
 * Interface for partnership creation data
 */
export interface IPartnershipCreationData {
  courseId: string;
  projectId: string;
  requestedByUserId: string;
  requestedToUserId: string;
  requestMessage?: string;
}

/**
 * Interface for partnership update data
 */
export interface IPartnershipUpdateData {
  status?: PartnershipStatus;
  responseMessage?: string;
}

/**
 * Partnership service class for managing partnership operations
 * Implements core business logic for handling partnerships between courses and projects
 */
export class PartnershipService {
  /**
   * Create a new partnership request
   * @param partnershipData The partnership request data
   * @returns The created partnership document
   */
  static async createPartnership(partnershipData: IPartnershipCreationData): Promise<IPartnership> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Validate ObjectIds
      if (!mongoose.isValidObjectId(partnershipData.courseId) || 
          !mongoose.isValidObjectId(partnershipData.projectId)) {
        throw new Error('Invalid course or project ID format');
      }

      // Check if course exists
      const course = await Course.findById(partnershipData.courseId);
      if (!course) {
        throw new Error(`Course with ID ${partnershipData.courseId} not found`);
      }

      // Check if project exists
      const project = await Project.findById(partnershipData.projectId);
      if (!project) {
        throw new Error(`Project with ID ${partnershipData.projectId} not found`);
      }

      // Verify users exist
      const requestingUser = await User.findOne({ userId: partnershipData.requestedByUserId });
      if (!requestingUser) {
        throw new Error(`Requesting user with ID ${partnershipData.requestedByUserId} not found`);
      }

      const receivingUser = await User.findOne({ userId: partnershipData.requestedToUserId });
      if (!receivingUser) {
        throw new Error(`Receiving user with ID ${partnershipData.requestedToUserId} not found`);
      }

      // Check if the partnership already exists
      const existingPartnership = await Partnership.findOne({
        courseId: partnershipData.courseId,
        projectId: partnershipData.projectId
      });

      if (existingPartnership) {
        throw new Error('A partnership between this course and project already exists');
      }

      // Check if course is already in an approved partnership
      const existingCoursePartnership = await Partnership.findOne({
        courseId: partnershipData.courseId,
        status: PartnershipStatus.APPROVED
      });

      if (existingCoursePartnership) {
        throw new Error('This course is already in an approved partnership');
      }

      // Check if project is already in an approved partnership
      const existingProjectPartnership = await Partnership.findOne({
        projectId: partnershipData.projectId,
        status: PartnershipStatus.APPROVED
      });

      if (existingProjectPartnership) {
        throw new Error('This project is already in an approved partnership');
      }

      // Create the partnership
      const partnership = new Partnership({
        courseId: partnershipData.courseId,
        projectId: partnershipData.projectId,
        requestedByUserId: partnershipData.requestedByUserId,
        requestedToUserId: partnershipData.requestedToUserId,
        requestMessage: partnershipData.requestMessage,
        status: PartnershipStatus.PENDING
      });

      // Calculate time analytics dimensions
      partnership.setTimeAnalyticsDimensions();

      // Save the partnership
      const savedPartnership = await partnership.save({ session });

      // Update user analytics
      await PartnershipService.updateUserPartnershipMetrics(
        partnershipData.requestedByUserId,
        'totalPartnershipsInitiated',
        1,
        session
      );

      await PartnershipService.updateUserPartnershipMetrics(
        partnershipData.requestedToUserId,
        'totalPartnershipsReceived',
        1,
        session
      );

      await session.commitTransaction();
      logger.info(`New partnership created: ${savedPartnership._id} between course ${partnershipData.courseId} and project ${partnershipData.projectId}`);
      
      return savedPartnership;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error creating partnership: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Get a partnership by its ID
   * @param partnershipId The MongoDB ID of the partnership
   * @returns The partnership document or null if not found
   */
  static async getPartnershipById(partnershipId: string, userId?: string): Promise<IPartnership | null> {
    try {
      if (!mongoose.isValidObjectId(partnershipId)) {
        throw new Error('Invalid partnership ID format');
      }
      
      const partnership = await Partnership.findById(partnershipId)
        .populate('courseId', 'name code level startDate endDate creatorUserId')
        .populate('projectId', 'title shortDescription studentLevel startDate endDate userId');
      
      // If userId is provided, check if the user is a participant or admin
      if (userId && partnership) {
        const isParticipant = 
          partnership.requestedByUserId === userId || 
          partnership.requestedToUserId === userId;
        
        if (!isParticipant) {
          // Check if user is an admin
          const user = await User.findOne({ userId });
          if (!user || !user.isAdmin) {
            throw new Error('Access denied: You are not a participant in this partnership');
          }
        }
      }
      
      return partnership;
    } catch (error) {
      logger.error(`Error getting partnership: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get partnerships by requestor user ID
   * @param userId The userId of the requester
   * @param status Optional status filter
   * @returns Array of matching partnership documents
   */
  static async getPartnershipsByRequestor(
    userId: string, 
    status?: PartnershipStatus
  ): Promise<IPartnership[]> {
    try {
      const query: any = { requestedByUserId: userId };
      
      if (status) {
        query.status = status;
      }
      
      return await Partnership.find(query)
        .sort({ createdAt: -1 })
        .populate('courseId', 'name code level startDate endDate')
        .populate('projectId', 'title shortDescription studentLevel startDate endDate');
    } catch (error) {
      logger.error(`Error getting partnerships by requestor: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get partnerships by recipient user ID
   * @param userId The userId of the request recipient
   * @param status Optional status filter
   * @returns Array of matching partnership documents
   */
  static async getPartnershipsByRecipient(
    userId: string, 
    status?: PartnershipStatus
  ): Promise<IPartnership[]> {
    try {
      const query: any = { requestedToUserId: userId };
      
      if (status) {
        query.status = status;
      }
      
      return await Partnership.find(query)
        .sort({ createdAt: -1 })
        .populate('courseId', 'name code level startDate endDate')
        .populate('projectId', 'title shortDescription studentLevel startDate endDate');
    } catch (error) {
      logger.error(`Error getting partnerships by recipient: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get partnerships for a specific course
   * @param courseId The MongoDB ID of the course
   * @returns Array of partnership documents
   */
  static async getPartnershipsByCourse(courseId: string): Promise<IPartnership[]> {
    try {
      if (!mongoose.isValidObjectId(courseId)) {
        throw new Error('Invalid course ID format');
      }
      
      return await Partnership.find({ courseId })
        .sort({ createdAt: -1 })
        .populate('projectId', 'title shortDescription studentLevel startDate endDate');
    } catch (error) {
      logger.error(`Error getting partnerships by course: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get partnerships for a specific project
   * @param projectId The MongoDB ID of the project
   * @returns Array of partnership documents
   */
  static async getPartnershipsByProject(projectId: string): Promise<IPartnership[]> {
    try {
      if (!mongoose.isValidObjectId(projectId)) {
        throw new Error('Invalid project ID format');
      }
      
      return await Partnership.find({ projectId })
        .sort({ createdAt: -1 })
        .populate('courseId', 'name code level startDate endDate');
    } catch (error) {
      logger.error(`Error getting partnerships by project: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update a partnership status
   * @param partnershipId The MongoDB ID of the partnership
   * @param updateData The data to update
   * @param userId The userId of the user making the update (for permission check)
   * @returns The updated partnership document
   */
  static async updatePartnership(
    partnershipId: string, 
    updateData: IPartnershipUpdateData, 
    userId: string
  ): Promise<IPartnership> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (!mongoose.isValidObjectId(partnershipId)) {
        throw new Error('Invalid partnership ID format');
      }
      
      // Get the partnership to update
      const partnership = await Partnership.findById(partnershipId);
      
      if (!partnership) {
        throw new Error(`Partnership with ID ${partnershipId} not found`);
      }

      // Check if user has permission to update this partnership
      if (partnership.requestedByUserId !== userId && 
          partnership.requestedToUserId !== userId) {
        
        // Check if user is an admin
        const user = await User.findOne({ userId });
        if (!user || !user.isAdmin) {
          throw new Error('Permission denied: Only partnership participants or admins can update this partnership');
        }
      }

      // Apply updates to the partnership object
      if (updateData.responseMessage !== undefined) {
        partnership.responseMessage = updateData.responseMessage;
      }

      // Handle status change with special processing
      if (updateData.status !== undefined && updateData.status !== partnership.status) {
        // Only recipient or admin can change status
        if (partnership.requestedToUserId !== userId) {
          const user = await User.findOne({ userId });
          if (!user || !user.isAdmin) {
            throw new Error('Permission denied: Only the request recipient or admin can change partnership status');
          }
        }

        // Handle specific status transitions
        if (updateData.status === PartnershipStatus.APPROVED) {
          // Check if course is already in an approved partnership
          const existingCoursePartnership = await Partnership.findOne({
            courseId: partnership.courseId,
            status: PartnershipStatus.APPROVED,
            _id: { $ne: partnership._id }
          });

          if (existingCoursePartnership) {
            throw new Error('This course is already in an approved partnership');
          }

          // Check if project is already in an approved partnership
          const existingProjectPartnership = await Partnership.findOne({
            projectId: partnership.projectId,
            status: PartnershipStatus.APPROVED,
            _id: { $ne: partnership._id }
          });

          if (existingProjectPartnership) {
            throw new Error('This project is already in an approved partnership');
          }
        }

        // Update the status
        partnership.status = updateData.status;
        
        // The pre-save hook in the model will handle setting timestamps and analytics
      }

      // Save the updated partnership
      const updatedPartnership = await partnership.save({ session });

      // Calculate success rate for users after status change
      if (updateData.status !== undefined) {
        await PartnershipService.recalculateSuccessRates(
          partnership.requestedByUserId,
          partnership.requestedToUserId,
          session
        );
      }

      await session.commitTransaction();
      logger.info(`Partnership ${partnershipId} updated to status ${partnership.status} by user ${userId}`);
      
      return updatedPartnership;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error updating partnership: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Mark a partnership as complete
   * @param partnershipId The MongoDB ID of the partnership
   * @param userId The userId of the user making the update (for permission check)
   * @returns The updated partnership document
   */
  static async completePartnership(
    partnershipId: string, 
    userId: string
  ): Promise<IPartnership> {
    try {
      return await PartnershipService.updatePartnership(
        partnershipId,
        { status: PartnershipStatus.COMPLETE },
        userId
      );
    } catch (error) {
      logger.error(`Error completing partnership: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Cancel a partnership request
   * @param partnershipId The MongoDB ID of the partnership
   * @param userId The userId of the user making the request (must be the original requestor)
   * @returns The updated partnership document
   */
  static async cancelPartnership(
    partnershipId: string, 
    userId: string
  ): Promise<IPartnership> {
    try {
      // Get the partnership
      const partnership = await Partnership.findById(partnershipId);
      
      if (!partnership) {
        throw new Error(`Partnership with ID ${partnershipId} not found`);
      }

      // Only the original requestor can cancel (unless it's an admin)
      if (partnership.requestedByUserId !== userId) {
        // Check if user is an admin
        const user = await User.findOne({ userId });
        if (!user || !user.isAdmin) {
          throw new Error('Permission denied: Only the original requestor or admin can cancel this partnership');
        }
      }

      // Only pending partnerships can be canceled
      if (partnership.status !== PartnershipStatus.PENDING) {
        throw new Error(`Cannot cancel partnership with status: ${partnership.status}`);
      }

      return await PartnershipService.updatePartnership(
        partnershipId,
        { status: PartnershipStatus.CANCELED },
        userId
      );
    } catch (error) {
      logger.error(`Error canceling partnership: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get partnerships with pagination
   * @param page The page number (1-based)
   * @param limit The number of items per page
   * @param filters Additional filters to apply
   * @param userId The user ID of the requester (for access control)
   * @returns Object containing paginated results and metadata
   */
  static async getPaginatedPartnerships(
    page: number = 1,
    limit: number = 10,
    filters: any = {},
    userId?: string
  ): Promise<{ partnerships: IPartnership[], total: number, pages: number }> {
    try {
      // Ensure valid pagination parameters
      const validPage = Math.max(1, page);
      const validLimit = Math.min(50, Math.max(1, limit)); // Limit between 1 and 50
      const skip = (validPage - 1) * validLimit;

      // Apply user-based access control if userId is provided
      if (userId) {
        // Check if user is admin
        const user = await User.findOne({ userId });
        const isAdmin = user?.isAdmin === true;
        
        // If not admin, restrict to only partnerships where user is a participant
        if (!isAdmin) {
          // Override any existing filters that might try to access other users' partnerships
          filters = {
            ...filters,
            $or: [
              { requestedByUserId: userId },
              { requestedToUserId: userId }
            ]
          };
          
          logger.info(`User ${userId} is not admin, restricting partnership access to their own partnerships`);
        }
      }

      // Count total matching documents for pagination metadata
      const total = await Partnership.countDocuments(filters);
      
      // Get the paginated results
      const partnerships = await Partnership.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit)
        .populate('courseId', 'name code level startDate endDate')
        .populate('projectId', 'title shortDescription studentLevel startDate endDate');

      // Calculate total pages
      const pages = Math.ceil(total / validLimit);

      return {
        partnerships,
        total,
        pages
      };
    } catch (error) {
      logger.error(`Error getting paginated partnerships: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get partnership analytics by time period
   * @param userId The userId of the user requesting analytics
   * @returns Array of statistical groupings
   * @throws Error if user is not an admin or has no access
   */
  static async getPartnershipAnalytics(userId: string): Promise<any[]> {
    try {
      // Check if user is an admin or has analytics access
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error(`User with userId ${userId} not found`);
      }
      
      if (!user.isAdmin) {
        throw new Error('Access denied: Only admin users can access partnership analytics');
      }
      
      return await Partnership.aggregate([
        {
          $group: {
            _id: {
              year: '$requestYear',
              quarter: '$requestQuarter'
            },
            total: { $sum: 1 },
            approved: {
              $sum: {
                $cond: [{ $eq: ['$status', PartnershipStatus.APPROVED] }, 1, 0]
              }
            },
            rejected: {
              $sum: {
                $cond: [{ $eq: ['$status', PartnershipStatus.REJECTED] }, 1, 0]
              }
            },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', PartnershipStatus.COMPLETE] }, 1, 0]
              }
            },
            avgApprovalTime: { $avg: '$approvalTimeInDays' },
            avgLifecycleDuration: { $avg: '$lifecycleDurationInDays' }
          }
        },
        {
          $sort: { '_id.year': -1, '_id.quarter': -1 }
        }
      ]);
    } catch (error) {
      logger.error(`Error getting partnership analytics: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Increment user partnership metrics
   * @param userId The userId of the user
   * @param field The metric field to increment
   * @param amount The amount to increment by
   * @param session Optional Mongoose session for transactions
   */
  private static async updateUserPartnershipMetrics(
    userId: string,
    field: 'totalPartnershipsInitiated' | 'totalPartnershipsReceived',
    amount: number = 1,
    session?: mongoose.ClientSession
  ): Promise<void> {
    try {
      const updateQuery: Record<string, any> = {};
      updateQuery[field] = amount;
      
      const options = session ? { session, new: true } : { new: true };
      
      const result = await User.findOneAndUpdate(
        { userId },
        { $inc: updateQuery },
        options
      );
      
      if (!result) {
        logger.warn(`Failed to update metrics for user ${userId}: User not found`);
      }
    } catch (error) {
      logger.error(`Error updating user metrics: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Recalculate success rates for partnership participants
   * @param requestorId The requestor's userId
   * @param recipientId The recipient's userId
   * @param session Optional Mongoose session for transactions
   */
  private static async recalculateSuccessRates(
    requestorId: string,
    recipientId: string,
    session?: mongoose.ClientSession
  ): Promise<void> {
    try {
      // Recalculate for requestor
      await PartnershipService.recalculateUserSuccessRate(requestorId, session);
      
      // Recalculate for recipient
      await PartnershipService.recalculateUserSuccessRate(recipientId, session);
    } catch (error) {
      logger.error(`Error recalculating success rates: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Recalculate success rate for a single user
   * @param userId The userId of the user
   * @param session Optional Mongoose session for transactions
   */
  /**
   * Send a message in a partnership conversation
   * @param partnershipId The MongoDB ID of the partnership
   * @param userId The userId of the message sender
   * @param messageText The message text to add
   * @returns The updated partnership document
   */
  static async sendMessage(
    partnershipId: string,
    userId: string,
    messageText: string
  ): Promise<IPartnership> {
    try {
      if (!mongoose.isValidObjectId(partnershipId)) {
        throw new Error('Invalid partnership ID format');
      }
      
      // Get the partnership
      const partnership = await Partnership.findById(partnershipId);
      
      if (!partnership) {
        throw new Error(`Partnership with ID ${partnershipId} not found`);
      }
      
      // Check if user is a participant in this partnership
      const isParticipant = partnership.requestedByUserId === userId || 
                            partnership.requestedToUserId === userId;
      
      if (!isParticipant) {
        // Check if user is an admin
        const user = await User.findOne({ userId });
        if (!user || !user.isAdmin) {
          throw new Error('Permission denied: Only partnership participants or admins can send messages');
        }
      }
      
      // Create the message object
      const newMessage = {
        userId,
        message: messageText,
        timestamp: new Date()
      };
      
      // Initialize messages array if it doesn't exist
      if (!partnership.messages) {
        partnership.messages = [];
      }
      
      // Add the new message
      partnership.messages.push(newMessage);
      
      // Save the updated partnership
      await partnership.save();
      
      logger.info(`Message added to partnership ${partnershipId} by user ${userId}`);
      
      return partnership;
    } catch (error) {
      logger.error(`Error sending partnership message: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private static async recalculateUserSuccessRate(
    userId: string,
    session?: mongoose.ClientSession
  ): Promise<void> {
    try {
      // Get total initiated partnerships
      const initiatedPartnerships = await Partnership.countDocuments({
        requestedByUserId: userId
      });
      
      // Get total successful partnerships (approved) when initiated
      const successfulInitiated = await Partnership.countDocuments({
        requestedByUserId: userId,
        status: { $in: [PartnershipStatus.APPROVED, PartnershipStatus.COMPLETE] }
      });
      
      // Calculate success rate as percentage
      const successRate = initiatedPartnerships > 0
        ? Math.round((successfulInitiated / initiatedPartnerships) * 100)
        : 0;
      
      // Update user's success rate
      const options = session ? { session } : {};
      
      await User.findOneAndUpdate(
        { userId },
        { $set: { successRate } },
        options
      );
    } catch (error) {
      logger.error(`Error calculating success rate for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}