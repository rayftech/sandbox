// src/test/userSync/mocks/test_rabbitmq_mock.ts
import { MessageHandler } from '../../../services/rabbitmq.service';

/**
 * Mock implementation of RabbitMQ service for testing
 */
export class RabbitMQServiceMock {
  private static instance: RabbitMQServiceMock;
  private connected: boolean = false;
  private queues: Map<string, any[]> = new Map();
  private consumers: Map<string, MessageHandler> = new Map();
  
  // Add properties to match the structure of RabbitMQService
  public connection: any = null;
  public channel: any = null;
  public connecting: boolean = false;
  public reconnectTimeout: NodeJS.Timeout | null = null;
  public connectionAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_INTERVAL = 5000;
  
  private mockCallbacks: {
    connect: jest.Mock;
    assertQueue: jest.Mock;
    assertExchange: jest.Mock;
    bindQueue: jest.Mock;
    sendToQueue: jest.Mock;
    consumeQueue: jest.Mock;
    publish: jest.Mock;
    close: jest.Mock;
  };

  private constructor() {
    this.mockCallbacks = {
      connect: jest.fn().mockImplementation(() => Promise.resolve(true)),
      assertQueue: jest.fn().mockImplementation(() => Promise.resolve({})),
      assertExchange: jest.fn().mockImplementation(() => Promise.resolve(true)),
      bindQueue: jest.fn().mockImplementation(() => Promise.resolve(true)),
      sendToQueue: jest.fn().mockImplementation((queue, message) => {
        this.addMessageToQueue(queue.toString(), message);
        return Promise.resolve(true);
      }),
      consumeQueue: jest.fn().mockImplementation((queue, handler) => {
        this.consumers.set(queue.toString(), handler);
        // Process any pending messages immediately
        const messages = this.queues.get(queue.toString()) || [];
        messages.forEach(msg => {
          handler(msg, { content: Buffer.from(JSON.stringify(msg)) } as any);
        });
        this.queues.set(queue.toString(), []);
        return Promise.resolve('consumer-tag');
      }),
      publish: jest.fn().mockImplementation((_, routingKey, message) => {
        // For simplicity, in tests publish directly to a queue named after the routing key
        this.addMessageToQueue(routingKey, message);
        return Promise.resolve(true);
      }),
      close: jest.fn().mockImplementation(() => {
        this.connected = false;
        return Promise.resolve();
      }),
    };
  }

  /**
   * Add a message to a queue, and process it if a consumer exists
   */
  private addMessageToQueue(queue: string, message: any): void {
    if (!this.queues.has(queue)) {
      this.queues.set(queue, []);
    }
    
    const messageContent = typeof message === 'string' 
      ? message 
      : Buffer.isBuffer(message) 
        ? JSON.parse(message.toString()) 
        : message;
    
    const queueMessages = this.queues.get(queue) || [];
    queueMessages.push(messageContent);
    this.queues.set(queue, queueMessages);
    
    // If there's a consumer for this queue, process the message
    const consumer = this.consumers.get(queue);
    if (consumer) {
      const messages = this.queues.get(queue) || [];
      messages.forEach(msg => {
        consumer(msg, { content: Buffer.from(JSON.stringify(msg)) } as any);
      });
      this.queues.set(queue, []);
    }
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): RabbitMQServiceMock {
    if (!RabbitMQServiceMock.instance) {
      RabbitMQServiceMock.instance = new RabbitMQServiceMock();
    }
    return RabbitMQServiceMock.instance;
  }

  /**
   * Reset the mock state
   */
  public static resetMock(): void {
    if (RabbitMQServiceMock.instance) {
      RabbitMQServiceMock.instance.queues.clear();
      RabbitMQServiceMock.instance.consumers.clear();
      Object.values(RabbitMQServiceMock.instance.mockCallbacks).forEach(mock => mock.mockClear());
    }
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static reset(): void {
    RabbitMQServiceMock.instance = undefined as any;
  }

  // Mock implementations of RabbitMQService methods
  public connect(): Promise<any> {
    this.connected = true;
    return this.mockCallbacks.connect();
  }

  public assertQueue(queue: string, options?: any): Promise<any> {
    if (!this.queues.has(queue)) {
      this.queues.set(queue, []);
    }
    return this.mockCallbacks.assertQueue(queue);
  }

  public assertExchange(exchange: string, type: string, options?: any): Promise<boolean> {
    return this.mockCallbacks.assertExchange(exchange, type);
  }

  public bindQueue(queue: string, exchange: string, routingKey: string): Promise<boolean> {
    return this.mockCallbacks.bindQueue(queue, exchange, routingKey);
  }

  public sendToQueue(queue: string, message: any, options?: any): Promise<boolean> {
    return this.mockCallbacks.sendToQueue(queue, message);
  }

  public consumeQueue(queue: string, handler: MessageHandler, options?: any): Promise<string | null> {
    return this.mockCallbacks.consumeQueue(queue, handler);
  }

  public publish(exchange: string, routingKey: string, message: any, options?: any): Promise<boolean> {
    return this.mockCallbacks.publish(exchange, routingKey, message);
  }

  public close(): Promise<void> {
    return this.mockCallbacks.close();
  }

  // Implement additional methods to match RabbitMQService structure
  public resetConnection(): void {
    this.channel = null;
    this.connection = null;
    this.connecting = false;
  }

  public scheduleReconnect(): void {
    // Mock implementation that does nothing
  }

  public async reregisterConsumers(): Promise<void> {
    // Mock implementation
    return Promise.resolve();
  }

  public async getChannel(): Promise<any> {
    // Mock implementation
    return this.channel || this.connect();
  }

  public parseMessage(msg: any): any {
    const content = msg.content.toString();
    try {
      return JSON.parse(content);
    } catch (error) {
      return content;
    }
  }

  // Helper methods for testing
  public isConnected(): boolean {
    return this.connected;
  }

  public getPendingMessages(queue: string): any[] {
    return this.queues.get(queue) || [];
  }

  public getMockCallbacks() {
    return this.mockCallbacks;
  }
}

// Export a function to create a jest mock that returns our mock implementation
export function createRabbitMQServiceMock() {
  return {
    getInstance: jest.fn().mockReturnValue(RabbitMQServiceMock.getInstance()),
    reset: jest.fn().mockImplementation(() => RabbitMQServiceMock.reset())
  };
}

describe('RabbitMQServiceMock', () => {
  it('should create a mock instance', () => {
    const mock = RabbitMQServiceMock.getInstance();
    expect(mock).toBeDefined();
  });
});