import { Request, Response, NextFunction } from 'express';
import { PartnershipService } from '../services/partnership.service';
import { PartnershipStatus } from '../models/partnership.model';
import { EventPublisher } from '../services/event.publisher';
import { createLogger } from '../config/logger';

const logger = createLogger('PartnershipController');

export class PartnershipController {
  private partnershipService: PartnershipService;
  
  constructor() {
    // Initialize the EventPublisher and PartnershipService
    const eventPublisher = new EventPublisher();
    this.partnershipService = new PartnershipService(eventPublisher);
  }

  /**
   * Create a new partnership request
   * @param req Express request with userId, course and project IDs, and optional message
   * @param res Express response
   * @param next Express next function
   */
  async createPartnershipRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { courseId, projectId, requestedToUserId, requestMessage, startDate, endDate } = req.body;
      const requestedByUserId = req.user.userId;
      
      // Validate required fields
      if (!courseId || !projectId || !requestedToUserId) {
        return res.status(400).json({
          success: false,
          message: 'Required fields missing: courseId, projectId, and requestedToUserId are required'
        });
      }
      
      // Create the partnership request
      const partnership = await this.partnershipService.createPartnership({
        courseId,
        projectId,
        requestedByUserId,
        requestedToUserId,
        requestMessage,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });
      
      return res.status(201).json({
        success: true,
        message: 'Partnership request created successfully',
        data: partnership
      });
    } catch (error) {
      logger.error(`Error creating partnership request: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };

  /**
   * Respond to a partnership request (approve, reject)
   * @param req Express request with partnershipId, response type, and optional message
   * @param res Express response
   * @param next Express next function
   */
  async respondToPartnershipRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { partnershipId } = req.params;
      const { responseType, responseMessage, startDate, endDate } = req.body;
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
      const updateData: any = {
        status,
        responseMessage
      };
      
      // Add dates if provided and approved
      if (status === PartnershipStatus.APPROVED) {
        if (startDate) updateData.startDate = new Date(startDate);
        if (endDate) updateData.endDate = new Date(endDate);
      }
      
      const partnership = await this.partnershipService.updatePartnership(
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
    }
  };

  /**
   * Cancel a partnership request
   * @param req Express request with partnershipId
   * @param res Express response
   * @param next Express next function
   */
  async cancelPartnershipRequest = async (req: Request, res: Response, next: NextFunction) => {
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
      const partnership = await this.partnershipService.updatePartnership(
        partnershipId,
        { status: PartnershipStatus.CANCELED },
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
    }
  };

  /**
   * Complete a partnership
   * @param req Express request with partnershipId and successMetrics
   * @param res Express response
   * @param next Express next function
   */
  async completePartnership = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { partnershipId } = req.params;
      const { successMetrics } = req.body;
      const userId = req.user.userId;
      
      // Validate required fields
      if (!partnershipId) {
        return res.status(400).json({
          success: false,
          message: 'Required field missing: partnershipId is required'
        });
      }
      
      // Complete the partnership
      const partnership = await this.partnershipService.completePartnership(
        partnershipId,
        userId,
        successMetrics
      );
      
      return res.status(200).json({
        success: true,
        message: 'Partnership completed successfully',
        data: partnership
      });
    } catch (error) {
      logger.error(`Error completing partnership: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };

  /**
   * Send a message in a partnership conversation
   * @param req Express request with partnershipId and message
   * @param res Express response
   * @param next Express next function
   */
  async sendPartnershipMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { partnershipId } = req.params;
      const { message } = req.body;
      const userId = req.user.userId;
      
      // Validate required fields
      if (!partnershipId || !message) {
        return res.status(400).json({
          success: false,
          message: 'Required fields missing: partnershipId and message are required'
        });
      }
      
      // Add the message
      const partnership = await this.partnershipService.addMessage(
        partnershipId,
        userId,
        message
      );
      
      return res.status(200).json({
        success: true,
        message: 'Message sent successfully',
        data: partnership
      });
    } catch (error) {
      logger.error(`Error sending partnership message: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };

  /**
   * Get a partnership conversation
   * @param req Express request with partnershipId
   * @param res Express response
   * @param next Express next function
   */
  async getPartnershipConversation = async (req: Request, res: Response, next: NextFunction) => {
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
      
      // Get the partnership
      const partnership = await this.partnershipService.getPartnershipById(partnershipId);
      
      // Verify user is authorized to view this conversation
      const isRequester = partnership.requestedByUserId === userId;
      const isRecipient = partnership.requestedToUserId === userId;
      
      if (!isRequester && !isRecipient) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this conversation'
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
    } catch (error) {
      logger.error(`Error getting partnership conversation: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };

  /**
   * Update partnership dates
   * @param req Express request with partnershipId, startDate, and endDate
   * @param res Express response
   * @param next Express next function
   */
  async updatePartnershipDates = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { partnershipId } = req.params;
      const { startDate, endDate } = req.body;
      const userId = req.user.userId;
      
      // Validate required fields
      if (!partnershipId || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Required fields missing: partnershipId, startDate, and endDate are required'
        });
      }
      
      // Update the partnership dates
      const partnership = await this.partnershipService.updatePartnershipDates(
        partnershipId,
        new Date(startDate),
        new Date(endDate),
        userId
      );
      
      return res.status(200).json({
        success: true,
        message: 'Partnership dates updated successfully',
        data: partnership
      });
    } catch (error) {
      logger.error(`Error updating partnership dates: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };

  /**
   * Get pending partnership requests
   * @param req Express request
   * @param res Express response
   * @param next Express next function
   */
  async getPendingPartnershipRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user.userId;
      
      // Get pending partnerships
      const partnerships = await this.partnershipService.getPendingPartnershipRequests(userId);
      
      return res.status(200).json({
        success: true,
        count: partnerships.length,
        data: partnerships
      });
    } catch (error) {
      logger.error(`Error getting pending partnership requests: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };

  /**
   * Get partnerships by status
   * @param req Express request with status
   * @param res Express response
   * @param next Express next function
   */
  async getPartnershipsByStatus = async (req: Request, res: Response, next: NextFunction) => {
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
      
      // Get partnerships by status
      const partnerships = await this.partnershipService.getPartnershipsByStatus(
        userId,
        status as PartnershipStatus
      );
      
      return res.status(200).json({
        success: true,
        count: partnerships.length,
        data: partnerships
      });
    } catch (error) {
      logger.error(`Error getting partnerships by status: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };

  /**
   * Get active partnerships
   * @param req Express request
   * @param res Express response
   * @param next Express next function
   */
  async getActivePartnerships = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user.userId;
      
      // Get active partnerships
      const partnerships = await this.partnershipService.getActivePartnerships(userId);
      
      return res.status(200).json({
        success: true,
        count: partnerships.length,
        data: partnerships
      });
    } catch (error) {
      logger.error(`Error getting active partnerships: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };

  /**
   * Get partnership analytics
   * @param req Express request with optional filters
   * @param res Express response
   * @param next Express next function
   */
  async getPartnershipAnalytics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user.userId;
      const { year, quarter } = req.query;
      
      // Parse filters
      const filters: any = {};
      if (year) filters.year = parseInt(year as string);
      if (quarter) filters.quarter = parseInt(quarter as string);
      
      // Get analytics
      const analytics = await this.partnershipService.getPartnershipAnalytics(userId, filters);
      
      return res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error) {
      logger.error(`Error getting partnership analytics: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  };
}

export default new PartnershipController();