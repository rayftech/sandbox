// src/services/event.publisher.ts
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../config/logger';
import { RabbitMQService, QueueType, ExchangeType } from './rabbitmq.service';
import {
  BaseEvent,
  EventType,
  PartnershipEvent,
  UserEvent,
  CourseEvent,
  ProjectEvent,
  EmailNotificationEvent,
  SystemNotificationEvent
} from '../models/events.model';

// Constants for exchanges and routing keys
const EXCHANGE_EVENTS = 'events';
const EXCHANGE_NOTIFICATIONS = 'notifications';

const logger = createLogger('EventPublisher');

/**
 * Event Publisher Service
 * Responsible for publishing events to RabbitMQ
 */
export class EventPublisher {
  private static instance: EventPublisher;
  private rabbitMQService: RabbitMQService;
  private initialized: boolean = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.rabbitMQService = RabbitMQService.getInstance();
  }

  /**
   * Get the singleton instance of EventPublisher
   * @returns The EventPublisher instance
   */
  public static getInstance(): EventPublisher {
    if (!EventPublisher.instance) {
      EventPublisher.instance = new EventPublisher();
    }
    return EventPublisher.instance;
  }

  /**
   * Initialize the event publisher
   * Sets up exchanges and queues
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      // Connect to RabbitMQ
      await this.rabbitMQService.connect();

      // Create main exchanges
      await this.rabbitMQService.assertExchange(EXCHANGE_EVENTS, ExchangeType.TOPIC);
      await this.rabbitMQService.assertExchange(EXCHANGE_NOTIFICATIONS, ExchangeType.DIRECT);

      // Create standard queues
      await this.rabbitMQService.assertQueue(QueueType.NOTIFICATION);
      await this.rabbitMQService.assertQueue(QueueType.PARTNERSHIP_REQUEST);
      await this.rabbitMQService.assertQueue(QueueType.ANALYTICS);
      await this.rabbitMQService.assertQueue(QueueType.EMAIL);

      // Bind queues to exchanges
      await this.rabbitMQService.bindQueue(
        QueueType.NOTIFICATION,
        EXCHANGE_EVENTS,
        'notification.#'
      );
      
      await this.rabbitMQService.bindQueue(
        QueueType.PARTNERSHIP_REQUEST,
        EXCHANGE_EVENTS,
        'partnership.#'
      );
      
      await this.rabbitMQService.bindQueue(
        QueueType.ANALYTICS,
        EXCHANGE_EVENTS,
        '#'  // Bind to all events for analytics
      );
      
      await this.rabbitMQService.bindQueue(
        QueueType.EMAIL,
        EXCHANGE_NOTIFICATIONS,
        'email'
      );

      this.initialized = true;
      logger.info('Event publisher initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize event publisher: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Create a base event with common fields
   * @param type Event type
   * @param source Source system/component
   * @returns Base event
   */
  private createBaseEvent(type: EventType, source?: string): BaseEvent {
    return {
      id: uuidv4(),
      type,
      timestamp: new Date(),
      correlationId: uuidv4(),
      source: source || 'api',
    };
  }

  /**
   * Publish a partnership event
   * @param eventType Partnership event type
   * @param data Partnership event data
   * @returns Promise resolving to true if successful
   */
  public async publishPartnershipEvent(
    eventType: EventType,
    data: Omit<PartnershipEvent, 'id' | 'type' | 'timestamp' | 'correlationId' | 'source'>
  ): Promise<boolean> {
    await this.initialize();

    const event: PartnershipEvent = {
      ...this.createBaseEvent(eventType, 'partnership-service'),
      ...data
    };

    // Determine routing key from event type
    const routingKey = eventType;

    try {
      const published = await this.rabbitMQService.publish(
        EXCHANGE_EVENTS,
        routingKey,
        event
      );

      if (published) {
        logger.info(`Published partnership event: ${eventType}, ID: ${event.partnershipId}`);
      } else {
        logger.warn(`Publishing partnership event was buffered: ${eventType}, ID: ${event.partnershipId}`);
      }

      return published;
    } catch (error) {
      logger.error(`Failed to publish partnership event: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Publish a user event
   * @param eventType User event type
   * @param data User event data
   * @returns Promise resolving to true if successful
   */
  public async publishUserEvent(
    eventType: EventType,
    data: Omit<UserEvent, 'id' | 'type' | 'timestamp' | 'correlationId' | 'source'>
  ): Promise<boolean> {
    await this.initialize();

    const event: UserEvent = {
      ...this.createBaseEvent(eventType, 'user-service'),
      ...data
    };

    // Determine routing key from event type
    const routingKey = eventType;

    try {
      const published = await this.rabbitMQService.publish(
        EXCHANGE_EVENTS,
        routingKey,
        event
      );

      if (published) {
        logger.info(`Published user event: ${eventType}, ID: ${event.userId}`);
      } else {
        logger.warn(`Publishing user event was buffered: ${eventType}, ID: ${event.userId}`);
      }

      return published;
    } catch (error) {
      logger.error(`Failed to publish user event: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Publish a course event
   * @param eventType Course event type
   * @param data Course event data
   * @returns Promise resolving to true if successful
   */
  public async publishCourseEvent(
    eventType: EventType,
    data: Omit<CourseEvent, 'id' | 'type' | 'timestamp' | 'correlationId' | 'source'>
  ): Promise<boolean> {
    await this.initialize();

    const event: CourseEvent = {
      ...this.createBaseEvent(eventType, 'course-service'),
      ...data
    };

    // Determine routing key from event type
    const routingKey = eventType;

    try {
      const published = await this.rabbitMQService.publish(
        EXCHANGE_EVENTS,
        routingKey,
        event
      );

      if (published) {
        logger.info(`Published course event: ${eventType}, ID: ${event.courseId}`);
      } else {
        logger.warn(`Publishing course event was buffered: ${eventType}, ID: ${event.courseId}`);
      }

      return published;
    } catch (error) {
      logger.error(`Failed to publish course event: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Publish a project event
   * @param eventType Project event type
   * @param data Project event data
   * @returns Promise resolving to true if successful
   */
  public async publishProjectEvent(
    eventType: EventType,
    data: Omit<ProjectEvent, 'id' | 'type' | 'timestamp' | 'correlationId' | 'source'>
  ): Promise<boolean> {
    await this.initialize();

    const event: ProjectEvent = {
      ...this.createBaseEvent(eventType, 'project-service'),
      ...data
    };

    // Determine routing key from event type
    const routingKey = eventType;

    try {
      const published = await this.rabbitMQService.publish(
        EXCHANGE_EVENTS,
        routingKey,
        event
      );

      if (published) {
        logger.info(`Published project event: ${eventType}, ID: ${event.projectId}`);
      } else {
        logger.warn(`Publishing project event was buffered: ${eventType}, ID: ${event.projectId}`);
      }

      return published;
    } catch (error) {
      logger.error(`Failed to publish project event: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Publish an email notification event
   * @param data Email notification data
   * @returns Promise resolving to true if successful
   */
  public async publishEmailNotification(
    data: Omit<EmailNotificationEvent, 'id' | 'type' | 'timestamp' | 'correlationId' | 'source'>
  ): Promise<boolean> {
    await this.initialize();

    const event: EmailNotificationEvent = {
      ...this.createBaseEvent(EventType.NOTIFICATION_EMAIL, 'notification-service'),
      ...data
    };

    try {
      const published = await this.rabbitMQService.publish(
        EXCHANGE_NOTIFICATIONS,
        'email',
        event
      );

      if (published) {
        logger.info(`Published email notification: ${event.subject}, Recipient: ${event.recipientEmail}`);
      } else {
        logger.warn(`Publishing email notification was buffered: ${event.subject}, Recipient: ${event.recipientEmail}`);
      }

      return published;
    } catch (error) {
      logger.error(`Failed to publish email notification: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Publish a system notification event
   * @param data System notification data
   * @returns Promise resolving to true if successful
   */
  public async publishSystemNotification(
    data: Omit<SystemNotificationEvent, 'id' | 'type' | 'timestamp' | 'correlationId' | 'source'>
  ): Promise<boolean> {
    await this.initialize();

    const event: SystemNotificationEvent = {
      ...this.createBaseEvent(EventType.NOTIFICATION_SYSTEM, 'notification-service'),
      ...data
    };

    try {
      const published = await this.rabbitMQService.sendToQueue(
        QueueType.NOTIFICATION,
        event
      );

      if (published) {
        logger.info(`Published system notification: ${event.title}, Recipient: ${event.recipientUserId}`);
      } else {
        logger.warn(`Publishing system notification was buffered: ${event.title}, Recipient: ${event.recipientUserId}`);
      }

      return published;
    } catch (error) {
      logger.error(`Failed to publish system notification: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}