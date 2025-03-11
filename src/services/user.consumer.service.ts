// src/services/user.consumer.service.ts
import { RabbitMQService, } from './rabbitmq.service';
import { UserService } from './user.service';
import { createLogger } from '../config/logger';
import { EventPublisher } from './event.publisher';
import { EventType } from '../models/events.model';

const logger = createLogger('UserConsumerService');

/**
 * Service to consume user-related messages from RabbitMQ
 */
export class UserConsumerService {
  private static instance: UserConsumerService;
  private rabbitMQService: RabbitMQService;
  private initialized: boolean = false;
  private eventPublisher: EventPublisher;
  
  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.rabbitMQService = RabbitMQService.getInstance();
    this.eventPublisher = EventPublisher.getInstance();
  }
  
  /**
   * Get the singleton instance of UserConsumerService
   */
  public static getInstance(): UserConsumerService {
    if (!UserConsumerService.instance) {
      UserConsumerService.instance = new UserConsumerService();
    }
    return UserConsumerService.instance;
  }
  
  /**
   * Initialize the consumer service
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }
    
    try {
      // Connect to RabbitMQ
      await this.rabbitMQService.connect();
      
      // Create a dedicated queue for user data if it doesn't exist
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
  private async handleUserSyncMessage(content: any): Promise<void> {
    try {
      logger.debug(`Received user sync message: ${JSON.stringify(content)}`);
      
      // Validate required fields
      if (!content.userId || !content.email) {
        logger.warn('Incomplete user data received in message');
        return;
      }
      
      // Create or update user
      const user = await UserService.createOrUpdateUser({
        userId: content.userId,
        email: content.email,
        firstName: content.firstName || '',
        lastName: content.lastName || '',
        userType: content.userType || 'user',
        isAdmin: content.isAdmin || false
      });
      
      // Publish event
      const isNewUser = user.createdAt === user.updatedAt;
      const eventType = isNewUser ? EventType.USER_CREATED : EventType.USER_UPDATED;
      
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
    }
  }
}