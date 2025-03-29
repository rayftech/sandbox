// src/services/strapi-consumer.service.ts
import { createLogger } from '../config/logger';
import { RabbitMQService, ExchangeType } from './rabbitmq.service';
import { StrapiSyncService } from './strapi-sync.service';
import { StrapiOperationType, StrapiOperationRequest, StrapiOperationResponse } from './request-response.service';

const logger = createLogger('StrapiConsumerService');

// Constants for the request-response pattern
const EXCHANGE_REQUESTS = 'strapi_requests';
const EXCHANGE_RESPONSES = 'strapi_responses';
const QUEUE_REQUESTS = 'strapi_operation_requests';
const QUEUE_RESPONSES = 'strapi_operation_responses';

/**
 * Service for consuming Strapi operation requests from RabbitMQ
 * and processing them against the Strapi CMS
 */
export class StrapiConsumerService {
  private static instance: StrapiConsumerService | null = null;
  private rabbitMQService: RabbitMQService;
  private strapiSyncService: StrapiSyncService;
  private initialized: boolean = false;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(rabbitMQService?: RabbitMQService, strapiSyncService?: StrapiSyncService) {
    this.rabbitMQService = rabbitMQService || RabbitMQService.getInstance();
    this.strapiSyncService = strapiSyncService || StrapiSyncService.getInstance();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    rabbitMQService?: RabbitMQService,
    strapiSyncService?: StrapiSyncService
  ): StrapiConsumerService {
    if (!StrapiConsumerService.instance) {
      StrapiConsumerService.instance = new StrapiConsumerService(
        rabbitMQService,
        strapiSyncService
      );
    }
    return StrapiConsumerService.instance;
  }

  /**
   * Reset the singleton instance (mainly for testing)
   */
  public static reset(): void {
    StrapiConsumerService.instance = null;
  }

  /**
   * Initialize the consumer service
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      // Ensure RabbitMQ connection
      await this.rabbitMQService.connect();
      
      // Initialize Strapi sync service
      await this.strapiSyncService.initialize();
      
      // Set up exchanges if they don't exist
      await this.rabbitMQService.assertExchange(EXCHANGE_REQUESTS, ExchangeType.DIRECT);
      await this.rabbitMQService.assertExchange(EXCHANGE_RESPONSES, ExchangeType.DIRECT);
      
      // Set up queues if they don't exist
      await this.rabbitMQService.assertQueue(QUEUE_REQUESTS);
      await this.rabbitMQService.assertQueue(QUEUE_RESPONSES);
      
      // Bind the request queue to the request exchange
      await this.rabbitMQService.bindQueue(QUEUE_REQUESTS, EXCHANGE_REQUESTS, 'strapi.request');
      
      // Set up consumer for request queue
      await this.rabbitMQService.consumeQueue(
        QUEUE_REQUESTS,
        this.handleRequest.bind(this)
      );
      
      this.initialized = true;
      logger.info('Strapi consumer service initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Strapi consumer service: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Handle a Strapi operation request
   */
  private async handleRequest(content: any): Promise<void> {
    // Early validation
    if (!content || !content.correlationId || !content.operationType) {
      logger.warn('Received invalid Strapi operation request', { content });
      return;
    }

    const request = content as StrapiOperationRequest;
    const { correlationId, operationType, data, userId } = request;
    
    logger.info(`Processing ${operationType} request with correlationId: ${correlationId} and the userid is ${userId}`);

    try {
      // Process the operation based on type
      let result;
      let strapiId;
      
      switch (operationType) {
        case StrapiOperationType.CREATE_COURSE:
          strapiId = await this.strapiSyncService.createCourseInStrapi(data);
          result = { strapiId };
          break;
          
        case StrapiOperationType.UPDATE_COURSE:
          await this.strapiSyncService.updateCourseInStrapi(data.strapiId, data);
          result = { updated: true };
          break;
          
        case StrapiOperationType.DELETE_COURSE:
          await this.strapiSyncService.deleteCourseInStrapi(data.strapiId);
          result = { deleted: true };
          break;
          
        case StrapiOperationType.CREATE_PROJECT:
          strapiId = await this.strapiSyncService.createProjectInStrapi(data);
          result = { strapiId };
          break;
          
        case StrapiOperationType.UPDATE_PROJECT:
          await this.strapiSyncService.updateProjectInStrapi(data.strapiId, data);
          result = { updated: true };
          break;
          
        case StrapiOperationType.DELETE_PROJECT:
          await this.strapiSyncService.deleteProjectInStrapi(data.strapiId);
          result = { deleted: true };
          break;
          
        case StrapiOperationType.SYNC_USER:
          // Implement user sync with Strapi if needed
          result = { synced: true };
          break;
          
        default:
          throw new Error(`Unsupported operation type: ${operationType}`);
      }

      // Create success response
      const response: StrapiOperationResponse = {
        correlationId,
        operationType,
        timestamp: new Date(),
        status: 'success',
        data: result,
        strapiId
      };

      // Send the response
      await this.sendResponse(response);
      logger.info(`Successfully processed ${operationType} with correlationId: ${correlationId}`);
      
    } catch (error) {
      logger.error(`Error processing ${operationType} request: ${error instanceof Error ? error.message : String(error)}`);
      
      // Create error response
      const response: StrapiOperationResponse = {
        correlationId,
        operationType,
        timestamp: new Date(),
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };

      // Send the error response
      await this.sendResponse(response);
    }
  }

  /**
   * Send a response back through RabbitMQ
   */
  private async sendResponse(response: StrapiOperationResponse): Promise<boolean> {
    try {
      const published = await this.rabbitMQService.publish(
        EXCHANGE_RESPONSES,
        'strapi.response',
        response
      );

      if (!published) {
        logger.error(`Failed to publish response for correlationId: ${response.correlationId}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`Error sending response: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}