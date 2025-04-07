import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { PartnershipService } from '../services/partnership.service';
import { PartnershipStatus } from '../models/partnership.model';
import { createLogger } from '../config/logger';

// Define the extended Request type with user property
export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    [key: string]: any; // Allow other user properties
  };
}

const logger = createLogger('PartnershipController');

export class PartnershipController {

  /**
   * Create a new partnership request
   * @param req Express request with userId, course and project IDs, and optional message
   * @param res Express response
   * @param next Express next function
   */
  async createPartnershipRequest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const { courseId, projectId, requestMessage, } = req.body;
      const requestedByUserId = req.user.userId;
      
      // Validate required fields
      if (!courseId || !projectId) {
        return res.status(400).json({
          success: false,
          message: 'Required fields missing: courseId and projectId are required'
        });
      }
      
      // Get the requestedToUserId from either the course or project
      let requestedToUserId: string;
      try {
        // Try to get owner of project first
        const Project = mongoose.model('Project');
        const project = await Project.findById(projectId);
        
        if (project) {
          // If requester is project owner, get course owner
          if (project.userId === requestedByUserId) {
            const Course = mongoose.model('Course'); 
            const course = await Course.findById(courseId);
            
            if (!course) {
              return res.status(404).json({
                success: false,
                message: `Course with ID ${courseId} not found`
              });
            }
            
            requestedToUserId = course.creatorUserId;
          } else {
            // Requester is not project owner, so recipient is project owner
            requestedToUserId = project.userId;
          }
        } else {
          return res.status(404).json({
            success: false,
            message: `Project with ID ${projectId} not found`
          });
        }
      } catch (error) {
        logger.error(`Error determining requestedToUserId: ${error instanceof Error ? error.message : String(error)}`);
        return res.status(500).json({
          success: false,
          message: 'Error determining partnership recipient'
        });
      }
      
      // Create the partnership request with correct data structure
      const partnershipData = {
        courseId,
        projectId,
        requestedByUserId,
        requestedToUserId,
        requestMessage
      };
      
      // Call the static method from the service
      const partnership = await PartnershipService.createPartnership(partnershipData);
      
      return res.status(201).json({
        success: true,
        message: 'Partnership request created successfully',
        data: partnership
      });
    } catch (error) {
      logger.error(`Error creating partnership request: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };

  /**
   * Respond to a partnership request (approve, reject)
   * @param req Express request with partnershipId, response type, and optional message
   * @param res Express response
   * @param next Express next function
   */
  async respondToPartnershipRequest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const { partnershipId } = req.params;
      const { responseType, responseMessage,} = req.body;
      const userId = req.user.userId;
      
      // Validate required fields
      if (!partnershipId || !responseType) {
        return res.status(400).json({
          success: false,
          message: 'Required fields missing: partnershipId and responseType are required'
        });
      }
      
      // Determine the status based on response type
      let status: PartnershipStatus;
      switch (responseType.toLowerCase()) {
        case 'approve':
          status = PartnershipStatus.APPROVED;
          break;
        case 'reject':
          status = PartnershipStatus.REJECTED;
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid responseType. Must be either "approve" or "reject"'
          });
      }
      
      // Update the partnership
      const updateData = {
        status,
        responseMessage
      };
      
      // Call the static method from the service
      const partnership = await PartnershipService.updatePartnership(
        partnershipId,
        updateData,
        userId
      );
      
      return res.status(200).json({
        success: true,
        message: `Partnership request ${responseType.toLowerCase()}d successfully`,
        data: partnership
      });
    } catch (error) {
      logger.error(`Error responding to partnership request: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };

  /**
   * Cancel a partnership request
   * @param req Express request with partnershipId
   * @param res Express response
   * @param next Express next function
   */
  async cancelPartnershipRequest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const { partnershipId } = req.params;
      const userId = req.user.userId;
      
      // Validate required fields
      if (!partnershipId) {
        return res.status(400).json({
          success: false,
          message: 'Required field missing: partnershipId is required'
        });
      }
      
      // Cancel the partnership
      const partnership = await PartnershipService.cancelPartnership(
        partnershipId,
        userId
      );
      
      return res.status(200).json({
        success: true,
        message: 'Partnership request canceled successfully',
        data: partnership
      });
    } catch (error) {
      logger.error(`Error canceling partnership request: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };

  /**
   * Complete a partnership
   * @param req Express request with partnershipId and successMetrics
   * @param res Express response
   * @param next Express next function
   */
  async completePartnership(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const { partnershipId } = req.params;
      // const { successMetrics } = req.body;
      const userId = req.user.userId;
      
      // Validate required fields
      if (!partnershipId) {
        return res.status(400).json({
          success: false,
          message: 'Required field missing: partnershipId is required'
        });
      }
      
      // Complete the partnership
      const partnership = await PartnershipService.completePartnership(
        partnershipId,
        userId
      );
      
      return res.status(200).json({
        success: true,
        message: 'Partnership completed successfully',
        data: partnership
      });
    } catch (error) {
      logger.error(`Error completing partnership: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };

  /**
   * Send a message in a partnership conversation
   * @param req Express request with partnershipId and message
   * @param res Express response
   * @param next Express next function
   */
  async sendPartnershipMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const { partnershipId } = req.params;
      const { message } = req.body;
      // const userId = req.user.userId;
      
      // Validate required fields
      if (!partnershipId || !message) {
        return res.status(400).json({
          success: false,
          message: 'Required fields missing: partnershipId and message are required'
        });
      }
      
      // Currently not implemented in service, would need to be added
      return res.status(501).json({
        success: false,
        message: 'Message functionality not yet implemented'
      });
    } catch (error) {
      logger.error(`Error sending partnership message: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };

  /**
   * Get a partnership conversation
   * @param req Express request with partnershipId
   * @param res Express response
   * @param next Express next function
   */
  async getPartnershipConversation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const { partnershipId } = req.params;
      const userId = req.user.userId;
      
      // Validate required fields
      if (!partnershipId) {
        return res.status(400).json({
          success: false,
          message: 'Required field missing: partnershipId is required'
        });
      }
      
      try {
        // Get the partnership with permission check
        const partnership = await PartnershipService.getPartnershipById(partnershipId, userId);
        
        if (!partnership) {
          return res.status(404).json({
            success: false,
            message: `Partnership with ID ${partnershipId} not found`
          });
        }
        
        // Return the messages
        return res.status(200).json({
          success: true,
          data: {
            partnershipId: partnership._id,
            courseId: partnership.courseId,
            projectId: partnership.projectId,
            status: partnership.status,
            messages: partnership.messages || []
          }
        });
      } catch (accessError) {
        // Handle access denied errors
        if (accessError instanceof Error && accessError.message.includes('Access denied')) {
          return res.status(403).json({
            success: false,
            message: accessError.message
          });
        }
        throw accessError;
      }
    } catch (error) {
      logger.error(`Error getting partnership conversation: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };

  /**
   * Update partnership dates
   * @param req Express request with partnershipId, startDate, and endDate
   * @param res Express response
   * @param next Express next function
   */
  async updatePartnershipDates(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const { partnershipId } = req.params;
      const { startDate, endDate } = req.body;
      // const userId = req.user.userId;
      
      // Validate required fields
      if (!partnershipId || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Required fields missing: partnershipId, startDate, and endDate are required'
        });
      }

      // This functionality would need to be added to the service
      return res.status(501).json({
        success: false,
        message: 'Date update functionality not yet implemented'
      });
    } catch (error) {
      logger.error(`Error updating partnership dates: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };

  /**
   * Get pending partnership requests
   * @param req Express request
   * @param res Express response
   * @param next Express next function
   */
  async getPendingPartnershipRequests(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const userId = req.user.userId;
      
      // Get partnerships by recipient and status PENDING
      const partnerships = await PartnershipService.getPartnershipsByRecipient(userId, PartnershipStatus.PENDING);
      
      return res.status(200).json({
        success: true,
        count: partnerships.length,
        data: partnerships
      });
    } catch (error) {
      logger.error(`Error getting pending partnership requests: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };

  /**
   * Get partnerships by status
   * @param req Express request with status
   * @param res Express response
   * @param next Express next function
   */
  async getPartnershipsByStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const userId = req.user.userId;
      const { status } = req.params;
      
      // Validate status
      if (!Object.values(PartnershipStatus).includes(status as PartnershipStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${Object.values(PartnershipStatus).join(', ')}`
        });
      }
      
      // Get partnerships by requestor or recipient and status
      const partnershipsByRequestor = await PartnershipService.getPartnershipsByRequestor(
        userId, 
        status as PartnershipStatus
      );
      
      const partnershipsByRecipient = await PartnershipService.getPartnershipsByRecipient(
        userId, 
        status as PartnershipStatus
      );
      
      // Combine results
      const partnerships = [...partnershipsByRequestor, ...partnershipsByRecipient];
      
      return res.status(200).json({
        success: true,
        count: partnerships.length,
        data: partnerships
      });
    } catch (error) {
      logger.error(`Error getting partnerships by status: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };

  /**
   * Get active partnerships
   * @param req Express request
   * @param res Express response
   * @param next Express next function
   */
  async getActivePartnerships(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const userId = req.user.userId;
      
      // Get active partnerships by combining approved partnerships from both requestor and recipient
      const partnershipsByRequestor = await PartnershipService.getPartnershipsByRequestor(
        userId, 
        PartnershipStatus.APPROVED
      );
      
      const partnershipsByRecipient = await PartnershipService.getPartnershipsByRecipient(
        userId, 
        PartnershipStatus.APPROVED
      );
      
      // Combine results
      const partnerships = [...partnershipsByRequestor, ...partnershipsByRecipient];
      
      return res.status(200).json({
        success: true,
        count: partnerships.length,
        data: partnerships
      });
    } catch (error) {
      logger.error(`Error getting active partnerships: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };

  /**
   * Get partnership analytics
   * @param req Express request with optional filters
   * @param res Express response
   * @param next Express next function
   */
  async getPartnershipAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | undefined> {
    try {
      const userId = req.user.userId;
      
      // Call the static method from the service with user ID for access control
      const analytics = await PartnershipService.getPartnershipAnalytics(userId);
      
      return res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error) {
      // Check for access denied error specifically
      if (error instanceof Error && error.message.includes('Access denied')) {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }
      
      logger.error(`Error getting partnership analytics: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
      return undefined;
    }
  };
}

// Create controller instance
const controller = new PartnershipController();

export default controller;