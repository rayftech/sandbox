// src/services/user.consumer.service.ts
import { RabbitMQService } from './rabbitmq.service';
import { UserService } from './user.service';
import { createLogger } from '../config/logger';
import { EventPublisher } from './event.publisher';
import { EventType } from '../models/events.model';
import { IAmplifyUserData } from './user.service';

const logger = createLogger('UserConsumerService');

/**
 * Service to consume user-related messages from RabbitMQ
 */
export class UserConsumerService {
  private static instance?: UserConsumerService;
  private rabbitMQService: RabbitMQService;
  private eventPublisher: EventPublisher;
  private initialized: boolean = false;

  
  /**
   * Private constructor for singleton pattern
   */
  private constructor(
    rabbitMQService?: RabbitMQService, 
    eventPublisher?: EventPublisher
  ) {
    this.rabbitMQService = rabbitMQService || RabbitMQService.getInstance();
    this.eventPublisher = eventPublisher || EventPublisher.getInstance();
  }
  
  /**
   * Get the singleton instance of UserConsumerService
   */
  public static getInstance(
    rabbitMQService?: RabbitMQService, 
    eventPublisher?: EventPublisher
  ): UserConsumerService {
    if (!UserConsumerService.instance) {
      UserConsumerService.instance = new UserConsumerService(
        rabbitMQService, 
        eventPublisher
      );
    }
    return UserConsumerService.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static reset(): void {
    UserConsumerService.instance = undefined;
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
      
      // Create a dedicated queue for user data
      const USER_SYNC_QUEUE = 'user_sync';
      await this.rabbitMQService.assertQueue(USER_SYNC_QUEUE);
      
      // Register consumer for user sync messages
      await this.rabbitMQService.consumeQueue(
        USER_SYNC_QUEUE,
        this.handleUserSyncMessage.bind(this)
      );
      
      logger.info('User consumer service initialized successfully');
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error(`Failed to initialize user consumer: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Handle incoming user synchronization messages
   */
  public async handleUserSyncMessage(content: any): Promise<void> {
    try {
      logger.debug(`Received user sync message: ${JSON.stringify(content)}`);
      
      // Validate required fields with more robust checking
      if (!content || !content.userId || !content.email) {
        logger.warn('Incomplete user data received in message', { content });
        return;
      }
      
      // Prepare user data with default values
      const userData: IAmplifyUserData = {
        userId: content.userId,
        email: content.email,
        firstName: content.firstName || '',
        lastName: content.lastName || '',
        userType: content.userType || 'academic',
        isAdmin: content.isAdmin || false
      };
      
      // Create or update user
      const user = await UserService.createOrUpdateUser(userData);
      
      // Determine event type
      const isNewUser = user.createdAt.getTime() === user.updatedAt.getTime();
      const eventType = isNewUser ? EventType.USER_CREATED : EventType.USER_UPDATED;
      
      // Publish user event
      await this.eventPublisher.publishUserEvent(eventType, {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType
      });
      
      logger.info(`User ${user.userId} successfully synchronized from message`);
    } catch (error) {
      logger.error(`Error processing user sync message: ${error instanceof Error ? error.message : String(error)}`);
      throw error; // Rethrow to allow for proper error handling in tests
    }
  }
}