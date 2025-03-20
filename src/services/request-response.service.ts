// src/services/request-response.service.ts
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../config/logger';
import { RabbitMQService, QueueType, ExchangeType } from './rabbitmq.service';
import { RetryUtility } from '../utils/retry.util';

const logger = createLogger('RequestResponseService');

// Constants for the request-response pattern
const EXCHANGE_REQUESTS = 'strapi_requests';
const EXCHANGE_RESPONSES = 'strapi_responses';
const QUEUE_REQUESTS = 'strapi_operation_requests';
const QUEUE_RESPONSES = 'strapi_operation_responses';

// Define types of operations that can be performed
export enum StrapiOperationType {
  CREATE_COURSE = 'create_course',
  UPDATE_COURSE = 'update_course',
  DELETE_COURSE = 'delete_course',
  CREATE_PROJECT = 'create_project',
  UPDATE_PROJECT = 'update_project',
  DELETE_PROJECT = 'delete_project',
  SYNC_USER = 'sync_user'
}

// Structure for requests sent to Strapi
export interface StrapiOperationRequest {
  correlationId: string;
  operationType: StrapiOperationType;
  timestamp: Date;
  data: any;
  userId: string;
  source: string;
  timeout?: number; // Optional timeout in milliseconds
}

// Structure for responses received from Strapi
export interface StrapiOperationResponse {
  correlationId: string;
  operationType: StrapiOperationType;
  timestamp: Date;
  status: 'success' | 'error';
  data?: any;
  error?: string;
  strapiId?: string;
}

// Structure to track pending requests
interface PendingRequest {
  request: StrapiOperationRequest;
  resolve: (value: StrapiOperationResponse) => void;
  reject: (reason: any) => void;
  timeoutId?: NodeJS.Timeout;
}

/**
 * Service implementing the Request-Response pattern over RabbitMQ
 * for synchronizing operations with Strapi CMS
 */
export class RequestResponseService {
  private static instance: RequestResponseService | null = null;
  private rabbitMQService: RabbitMQService;
  private initialized: boolean = false;
  
  // Map to track pending requests by correlationId
  private pendingRequests: Map<string, PendingRequest> = new Map();
  
  // Default timeout for requests (30 seconds)
  private defaultTimeout: number = 30000;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(rabbitMQService?: RabbitMQService) {
    this.rabbitMQService = rabbitMQService || RabbitMQService.getInstance();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(rabbitMQService?: RabbitMQService): RequestResponseService {
    if (!RequestResponseService.instance) {
      RequestResponseService.instance = new RequestResponseService(rabbitMQService);
    }
    return RequestResponseService.instance;
  }

  /**
   * Reset the singleton instance (mainly for testing)
   */
  public static reset(): void {
    RequestResponseService.instance = null;
  }

  /**
   * Initialize the request-response infrastructure
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      // Ensure RabbitMQ connection
      await this.rabbitMQService.connect();
      
      // Set up exchanges for requests and responses
      await this.rabbitMQService.assertExchange(EXCHANGE_REQUESTS, ExchangeType.DIRECT);
      await this.rabbitMQService.assertExchange(EXCHANGE_RESPONSES, ExchangeType.DIRECT);
      
      // Set up queues for requests and responses
      await this.rabbitMQService.assertQueue(QUEUE_REQUESTS);
      await this.rabbitMQService.assertQueue(QUEUE_RESPONSES);
      
      // Bind queues to exchanges
      await this.rabbitMQService.bindQueue(QUEUE_REQUESTS, EXCHANGE_REQUESTS, 'strapi.request');
      await this.rabbitMQService.bindQueue(QUEUE_RESPONSES, EXCHANGE_RESPONSES, 'strapi.response');
      
      // Set up consumer for response queue
      await this.rabbitMQService.consumeQueue(
        QUEUE_RESPONSES,
        this.handleResponse.bind(this)
      );
      
      this.initialized = true;
      logger.info('Request-Response service initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Request-Response service: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Handle responses from Strapi operations
   */
  private async handleResponse(content: any): Promise<void> {
    try {
      if (!content || !content.correlationId) {
        logger.warn('Received invalid response without correlationId', { content });
        return;
      }

      const response = content as StrapiOperationResponse;
      const correlationId = response.correlationId;
      
      logger.debug(`Received response for correlationId: ${correlationId}`);

      // Find the pending request
      const pendingRequest = this.pendingRequests.get(correlationId);
      
      if (!pendingRequest) {
        logger.warn(`Received response for unknown correlationId: ${correlationId}`);
        return;
      }

      // Clear any timeout
      if (pendingRequest.timeoutId) {
        clearTimeout(pendingRequest.timeoutId);
      }

      // Remove from pending requests
      this.pendingRequests.delete(correlationId);
      
      // Check response status
      if (response.status === 'success') {
        logger.info(`Operation ${response.operationType} completed successfully for correlationId: ${correlationId}`);
        pendingRequest.resolve(response);
      } else {
        logger.error(`Operation ${response.operationType} failed for correlationId: ${correlationId}: ${response.error}`);
        pendingRequest.reject(new Error(response.error || 'Unknown error from Strapi'));
      }
    } catch (error) {
      logger.error(`Error handling response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send a request to Strapi and wait for the response
   * @param operationType Type of operation to perform
   * @param data Data for the operation
   * @param userId User ID associated with the operation
   * @param timeout Optional timeout in milliseconds
   * @returns Promise that resolves with the response from Strapi
   */
  public async sendRequest(
    operationType: StrapiOperationType,
    data: any,
    userId: string,
    timeout?: number
  ): Promise<StrapiOperationResponse> {
    await this.initialize();

    // Create a new correlation ID
    const correlationId = uuidv4();
    
    // Create the request
    const request: StrapiOperationRequest = {
      correlationId,
      operationType,
      timestamp: new Date(),
      data,
      userId,
      source: 'backend',
      timeout: timeout || this.defaultTimeout
    };

    logger.info(`Sending ${operationType} request with correlationId: ${correlationId}`);

    // Create a promise to track the request
    const responsePromise = new Promise<StrapiOperationResponse>((resolve, reject) => {
      // Set up timeout
      const timeoutMs = request.timeout || this.defaultTimeout;
      const timeoutId = setTimeout(() => {
        // Remove from pending requests
        this.pendingRequests.delete(correlationId);
        
        // Reject with timeout error
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
        
        logger.error(`Request with correlationId ${correlationId} timed out after ${timeoutMs}ms`);
      }, timeoutMs);

      // Store in pending requests
      this.pendingRequests.set(correlationId, {
        request,
        resolve,
        reject,
        timeoutId
      });
    });

    // Send the request
    try {
      const published = await this.rabbitMQService.publish(
        EXCHANGE_REQUESTS,
        'strapi.request',
        request
      );

      if (!published) {
        throw new Error('Failed to publish request to RabbitMQ');
      }
    } catch (error) {
      // Clean up and reject if we couldn't send the request
      const pendingRequest = this.pendingRequests.get(correlationId);
      if (pendingRequest && pendingRequest.timeoutId) {
        clearTimeout(pendingRequest.timeoutId);
      }
      this.pendingRequests.delete(correlationId);
      
      throw error;
    }

    // Return the promise
    return responsePromise;
  }

  /**
   * Send a request with retry capability
   * @param operationType Type of operation to perform
   * @param data Data for the operation
   * @param userId User ID associated with the operation
   * @param options Retry options
   * @returns Promise that resolves with the response from Strapi
   */
  public async sendRequestWithRetry(
    operationType: StrapiOperationType,
    data: any,
    userId: string,
    options?: {
      timeout?: number;
      maxRetries?: number;
      initialDelay?: number;
    }
  ): Promise<StrapiOperationResponse> {
    const timeout = options?.timeout || this.defaultTimeout;
    
    return RetryUtility.withRetry(
      () => this.sendRequest(operationType, data, userId, timeout),
      {
        maxRetries: options?.maxRetries || 3,
        initialDelay: options?.initialDelay || 1000,
        onRetry: (error, attempt) => {
          logger.warn(`Retry ${attempt} for ${operationType}: ${error.message}`);
        }
      }
    );
  }

  /**
   * Create a course in Strapi
   * @param courseData Course data to create
   * @param userId User ID creating the course
   * @returns Promise resolving to the Strapi ID of the created course
   */
  public async createCourse(courseData: any, userId: string): Promise<string> {
    const response = await this.sendRequestWithRetry(
      StrapiOperationType.CREATE_COURSE,
      courseData,
      userId
    );
    
    if (!response.strapiId) {
      throw new Error('No strapiId returned for created course');
    }
    
    return response.strapiId;
  }

  /**
   * Update a course in Strapi
   * @param strapiId Strapi ID of the course
   * @param courseData Updated course data
   * @param userId User ID updating the course
   * @returns Promise resolving to true if successful
   */
  public async updateCourse(strapiId: string, courseData: any, userId: string): Promise<boolean> {
    const response = await this.sendRequestWithRetry(
      StrapiOperationType.UPDATE_COURSE,
      { strapiId, ...courseData },
      userId
    );
    
    return response.status === 'success';
  }

  /**
   * Delete a course in Strapi
   * @param strapiId Strapi ID of the course
   * @param userId User ID deleting the course
   * @returns Promise resolving to true if successful
   */
  public async deleteCourse(strapiId: string, userId: string): Promise<boolean> {
    const response = await this.sendRequestWithRetry(
      StrapiOperationType.DELETE_COURSE,
      { strapiId },
      userId
    );
    
    return response.status === 'success';
  }

  /**
   * Create a project in Strapi
   * @param projectData Project data to create
   * @param userId User ID creating the project
   * @returns Promise resolving to the Strapi ID of the created project
   */
  public async createProject(projectData: any, userId: string): Promise<string> {
    const response = await this.sendRequestWithRetry(
      StrapiOperationType.CREATE_PROJECT,
      projectData,
      userId
    );
    
    if (!response.strapiId) {
      throw new Error('No strapiId returned for created project');
    }
    
    return response.strapiId;
  }

  /**
   * Update a project in Strapi
   * @param strapiId Strapi ID of the project
   * @param projectData Updated project data
   * @param userId User ID updating the project
   * @returns Promise resolving to true if successful
   */
  public async updateProject(strapiId: string, projectData: any, userId: string): Promise<boolean> {
    const response = await this.sendRequestWithRetry(
      StrapiOperationType.UPDATE_PROJECT,
      { strapiId, ...projectData },
      userId
    );
    
    return response.status === 'success';
  }

  /**
   * Delete a project in Strapi
   * @param strapiId Strapi ID of the project
   * @param userId User ID deleting the project
   * @returns Promise resolving to true if successful
   */
  public async deleteProject(strapiId: string, userId: string): Promise<boolean> {
    const response = await this.sendRequestWithRetry(
      StrapiOperationType.DELETE_PROJECT,
      { strapiId },
      userId
    );
    
    return response.status === 'success';
  }

  /**
   * Sync user data with Strapi
   * @param userData User data to sync
   * @returns Promise resolving to true if successful
   */
  public async syncUser(userData: any): Promise<boolean> {
    const response = await this.sendRequestWithRetry(
      StrapiOperationType.SYNC_USER,
      userData,
      userData.userId
    );
    
    return response.status === 'success';
  }
  
  /**
   * Get statistics about pending requests
   * @returns Object containing stats about pending requests
   */
  public getPendingRequestStats(): { count: number; types: Record<string, number> } {
    const types: Record<string, number> = {};
    
    // Count request types
    for (const [_, pendingRequest] of this.pendingRequests) {
      const type = pendingRequest.request.operationType;
      types[type] = (types[type] || 0) + 1;
    }
    
    return {
      count: this.pendingRequests.size,
      types
    };
  }

  /**
   * Clean up any stale requests
   * @param maxAge Maximum age of requests in milliseconds
   * @returns Number of cleaned up requests
   */
  public cleanupStaleRequests(maxAge: number = 60000): number {
    const now = new Date().getTime();
    let cleanedUp = 0;
    
    for (const [correlationId, pendingRequest] of this.pendingRequests) {
      const requestTime = pendingRequest.request.timestamp.getTime();
      
      if (now - requestTime > maxAge) {
        // Clear timeout
        if (pendingRequest.timeoutId) {
          clearTimeout(pendingRequest.timeoutId);
        }
        
        // Reject with timeout
        pendingRequest.reject(new Error('Request cleaned up due to age'));
        
        // Remove from map
        this.pendingRequests.delete(correlationId);
        
        cleanedUp++;
        logger.warn(`Cleaned up stale request with correlationId: ${correlationId}`);
      }
    }
    
    return cleanedUp;
  }
}