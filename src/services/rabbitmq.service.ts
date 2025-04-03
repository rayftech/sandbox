// src/services/rabbitmq.service.ts
import * as amqplib from 'amqplib';
import { createLogger } from '../config/logger';

const logger = createLogger('RabbitMQService');

/**
 * Queue types for the application
 */
export enum QueueType {
  NOTIFICATION = 'notification',
  PARTNERSHIP_REQUEST = 'partnership_request',
  ANALYTICS = 'analytics',
  EMAIL = 'email'
}

/**
 * Exchange types for the application
 */
export enum ExchangeType {
  DIRECT = 'direct',
  FANOUT = 'fanout',
  TOPIC = 'topic'
}

/**
 * Message handler type definition
 */
export type MessageHandler = (content: any, msg: amqplib.ConsumeMessage) => Promise<void>;

/**
 * RabbitMQ service class for handling message broker operations
 * Implements the Singleton pattern to ensure only one connection to RabbitMQ
 */
export class RabbitMQService {
  private static instance: RabbitMQService;
  private connection: any = null;
  private channel: any = null;
  private connecting: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private connectionAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_INTERVAL = 5000; // 5 seconds
  
  // Store message handlers by queue name
  private consumers: Map<string, MessageHandler> = new Map();
  
  // Improved host selection with fallback capability
  private readonly isDockerEnv: boolean;
  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly password: string;
  private readonly vhost: string;

  /**
   * Private constructor to prevent direct instantiation
   */
  private constructor() {
    // Determine if running in Docker environment
    this.isDockerEnv = process.env.DOCKER_ENV === 'true';
    
    // Get environment variables with fallbacks
    const configuredHost = process.env.RABBITMQ_HOST;
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    // Log the environment details for debugging
    console.log('RabbitMQ Environment Details:', {
      DOCKER_ENV: this.isDockerEnv,
      NODE_ENV: nodeEnv,
      RABBITMQ_HOST: configuredHost
    });
    
    // Determine the host based on environment
    if (this.isDockerEnv) {
      this.host = 'rabbitmq'; // Use container name inside Docker
    } else if (configuredHost) {
      this.host = configuredHost; // Use explicitly configured host
    } else {
      this.host = 'localhost'; // Default to localhost
    }
    
    // Set other connection properties
    this.port = parseInt(process.env.RABBITMQ_PORT || '5672', 10);
    this.user = process.env.RABBITMQ_USER || 'admin';
    this.password = process.env.RABBITMQ_PASS || 'password';
    this.vhost = process.env.RABBITMQ_VHOST || '/';
  }

  /**
   * Get the singleton instance of RabbitMQService
   * @returns The RabbitMQService instance
   */
  public static getInstance(): RabbitMQService {
    if (!RabbitMQService.instance) {
      RabbitMQService.instance = new RabbitMQService();
    }
    return RabbitMQService.instance;
  }

  /**
   * Connect to RabbitMQ server with fallback capability
   * @returns Promise resolving to the Channel or null
   */
  public async connect(): Promise<any> {
    if (this.channel) {
      return this.channel;
    }

    if (this.connecting) {
      logger.debug('Connection to RabbitMQ already in progress');
      return null;
    }

    // Log all connection details for debugging
    logger.info('RabbitMQ Connection Details:', {
      host: this.host,
      port: this.port,
      user: this.user,
      vhost: this.vhost,
      dockerEnv: this.isDockerEnv
    });

    this.connecting = true;
    
    // Define hosts to try in order of preference
    const hostsToTry = [this.host];
    
    // Add fallback hosts if primary isn't already one of them
    if (this.isDockerEnv && this.host !== 'rabbitmq') {
      hostsToTry.push('rabbitmq');
    }
    
    if (!hostsToTry.includes('localhost')) {
      hostsToTry.push('localhost');
    }
    
    // Try each host in order
    for (const hostToTry of hostsToTry) {
      try {
        logger.info(`Connecting to RabbitMQ at ${hostToTry}:${this.port}`);
        const connectionString = `amqp://${this.user}:${this.password}@${hostToTry}:${this.port}${this.vhost}`;
        logger.info(`Attempting connection with string: ${connectionString.replace(this.password, '****')}`);
        
        // Connect to RabbitMQ
        this.connection = await amqplib.connect(connectionString);
        
        // Set up connection event handlers
        this.connection.on('error', (err: Error) => {
          logger.error(`RabbitMQ connection error: ${err.message}`);
          this.resetConnection();
          this.scheduleReconnect();
        });
        
        this.connection.on('close', () => {
          logger.warn('RabbitMQ connection closed');
          this.resetConnection();
          this.scheduleReconnect();
        });
        
        // Create a channel
        this.channel = await this.connection.createChannel();
        
        // Set up channel event handlers
        this.channel.on('error', (err: Error) => {
          logger.error(`RabbitMQ channel error: ${err.message}`);
        });
        
        this.channel.on('close', () => {
          logger.warn('RabbitMQ channel closed');
          this.channel = null;
        });
        
        // Connection successful
        this.connecting = false;
        this.connectionAttempts = 0;
        logger.info(`Successfully connected to RabbitMQ at ${hostToTry}`);
        
        // Re-register consumers if any were registered before
        if (this.consumers.size > 0) {
          await this.reregisterConsumers();
        }
        
        return this.channel;
      } catch (error) {
        logger.error(`Failed to connect to RabbitMQ at ${hostToTry}: ${error instanceof Error ? error.message : String(error)}`);
        // Continue to the next host
      }
    }
    
    // If we get here, all connection attempts failed
    this.connecting = false;
    logger.error('All RabbitMQ connection attempts failed');
    this.resetConnection();
    this.scheduleReconnect();
    return null;
  }

  /**
   * Reset connection and channel
   */
  private resetConnection(): void {
    this.channel = null;
    this.connection = null;
    this.connecting = false;
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.connectionAttempts++;
    
    if (this.connectionAttempts <= this.MAX_RECONNECT_ATTEMPTS) {
      // Exponential backoff with jitter
      const baseDelay = this.RECONNECT_INTERVAL;
      const exponentialDelay = baseDelay * Math.pow(1.5, this.connectionAttempts - 1);
      const jitter = Math.random() * 0.3 * exponentialDelay;
      const delay = Math.min(exponentialDelay + jitter, 60000); // Cap at 60 seconds
      
      logger.info(`Scheduling reconnection attempt ${this.connectionAttempts} in ${Math.round(delay / 1000)} seconds`);
      
      this.reconnectTimeout = setTimeout(async () => {
        this.reconnectTimeout = null;
        await this.connect();
      }, delay);
    } else {
      logger.error(`Maximum reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
    }
  }

  /**
   * Re-register all consumers after a reconnection
   */
  private async reregisterConsumers(): Promise<void> {
    if (!this.channel) {
      return;
    }
    
    for (const [queue, handler] of this.consumers.entries()) {
      try {
        await this.assertQueue(queue);
        await this.consumeQueue(queue, handler);
        logger.info(`Re-registered consumer for queue: ${queue}`);
      } catch (error) {
        logger.error(`Failed to re-register consumer for queue ${queue}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Close the RabbitMQ connection
   */
  public async close(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      this.connecting = false;
      this.connectionAttempts = 0;
      logger.info('RabbitMQ connection closed gracefully');
    } catch (error) {
      logger.error(`Error closing RabbitMQ connection: ${error instanceof Error ? error.message : String(error)}`);
      this.resetConnection();
    }
  }

  /**
   * Assert that a queue exists (create it if it doesn't)
   * @param queue Queue name to assert
   * @param options Queue options
   * @returns Promise resolving to the asserted queue
   */
  public async assertQueue(
    queue: string | QueueType,
    options: amqplib.Options.AssertQueue = { durable: true }
  ): Promise<amqplib.Replies.AssertQueue | null> {
    const channel = await this.getChannel();
    if (!channel) return null;

    try {
      const result = await channel.assertQueue(queue.toString(), options);
      logger.debug(`Queue '${queue}' asserted successfully`);
      return result;
    } catch (error) {
      logger.error(`Failed to assert queue '${queue}': ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Assert that an exchange exists (create it if it doesn't)
   * @param exchange Exchange name
   * @param type Exchange type
   * @param options Exchange options
   * @returns Promise resolving to true if successful
   */
  public async assertExchange(
    exchange: string,
    type: ExchangeType = ExchangeType.DIRECT,
    options: amqplib.Options.AssertExchange = { durable: true }
  ): Promise<boolean> {
    const channel = await this.getChannel();
    if (!channel) return false;

    try {
      await channel.assertExchange(exchange, type, options);
      logger.debug(`Exchange '${exchange}' of type '${type}' asserted successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to assert exchange '${exchange}': ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Bind a queue to an exchange
   * @param queue Queue name
   * @param exchange Exchange name
   * @param routingKey Routing key
   * @returns Promise resolving to true if successful
   */
  public async bindQueue(
    queue: string | QueueType,
    exchange: string,
    routingKey: string
  ): Promise<boolean> {
    const channel = await this.getChannel();
    if (!channel) return false;

    try {
      await channel.bindQueue(queue.toString(), exchange, routingKey);
      logger.debug(`Queue '${queue}' bound to exchange '${exchange}' with routing key '${routingKey}'`);
      return true;
    } catch (error) {
      logger.error(`Failed to bind queue '${queue}' to exchange '${exchange}': ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Send a message to a specific queue
   * @param queue Queue name
   * @param message Message content
   * @param options Message options
   * @returns Promise resolving to true if successful
   */
  public async sendToQueue(
    queue: string | QueueType,
    message: any,
    options: amqplib.Options.Publish = { persistent: true }
  ): Promise<boolean> {
    const channel = await this.getChannel();
    if (!channel) return false;

    try {
      // Ensure queue exists
      await this.assertQueue(queue.toString());
      
      // Convert message to buffer if needed
      const content = Buffer.isBuffer(message) 
        ? message 
        : Buffer.from(typeof message === 'string' ? message : JSON.stringify(message));
      
      const result = channel.sendToQueue(queue.toString(), content, options);
      
      if (result) {
        logger.debug(`Message sent to queue '${queue}' successfully`);
      } else {
        logger.warn(`Message sending to queue '${queue}' was buffered`);
      }
      
      return result;
    } catch (error) {
      logger.error(`Failed to send message to queue '${queue}': ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Publish a message to an exchange
   * @param exchange Exchange name
   * @param routingKey Routing key
   * @param message Message content
   * @param options Message options
   * @returns Promise resolving to true if successful
   */
  public async publish(
    exchange: string,
    routingKey: string,
    message: any,
    options: amqplib.Options.Publish = { persistent: true }
  ): Promise<boolean> {
    const channel = await this.getChannel();
    if (!channel) return false;

    try {
      // Convert message to buffer if needed
      const content = Buffer.isBuffer(message) 
        ? message 
        : Buffer.from(typeof message === 'string' ? message : JSON.stringify(message));
      
      const result = channel.publish(exchange, routingKey, content, options);
      
      if (result) {
        logger.debug(`Message published to exchange '${exchange}' with routing key '${routingKey}' successfully`);
      } else {
        logger.warn(`Message publishing to exchange '${exchange}' was buffered`);
      }
      
      return result;
    } catch (error) {
      logger.error(`Failed to publish message to exchange '${exchange}': ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Consume messages from a queue
   * @param queue Queue name
   * @param handler Message handler function
   * @param options Consume options
   * @returns Promise resolving to the consumer tag
   */
  public async consumeQueue(
    queue: string | QueueType,
    handler: MessageHandler,
    options: amqplib.Options.Consume = {}
  ): Promise<string | null> {
    const channel = await this.getChannel();
    if (!channel) return null;

    try {
      // Ensure queue exists
      await this.assertQueue(queue.toString());
      
      // Store the handler for potential reconnection
      this.consumers.set(queue.toString(), handler);
      
      // Create the consumer
      const { consumerTag } = await channel.consume(
        queue.toString(),
        async (msg: amqplib.ConsumeMessage | null) => {
          if (!msg) {
            logger.warn(`Received null message from queue '${queue}'`);
            return;
          }
          
          try {
            // Parse message content
            const content = this.parseMessage(msg);
            
            // Process the message
            await handler(content, msg);
            
            // Acknowledge the message
            channel.ack(msg);
          } catch (error) {
            logger.error(`Error processing message from queue '${queue}': ${error instanceof Error ? error.message : String(error)}`);
            
            // Negative acknowledgment - requeue the message
            // Only requeue if it's not already a redelivery, to avoid infinite loops
            channel.nack(msg, false, !msg.fields.redelivered);
          }
        },
        options
      );
      
      logger.info(`Consumer registered for queue '${queue}' with tag '${consumerTag}'`);
      return consumerTag;
    } catch (error) {
      logger.error(`Failed to consume from queue '${queue}': ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Parse a message from RabbitMQ
   * @param msg The message from RabbitMQ
   * @returns Parsed message content
   */
  private parseMessage(msg: amqplib.ConsumeMessage): any {
    const content = msg.content.toString();
    
    try {
      // Try to parse as JSON first
      return JSON.parse(content);
    } catch (error) {
      // If not JSON, return as string
      return content;
    }
  }

  /**
   * Get the RabbitMQ channel (connect if needed)
   * @returns Promise resolving to the channel or null
   */
  private async getChannel(): Promise<any> {
    if (!this.channel) {
      return await this.connect();
    }
    return this.channel;
  }
}