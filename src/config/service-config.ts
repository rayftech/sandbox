// src/config/service-config.ts
import dotenv from 'dotenv';
import { createLogger } from './logger';

// Load environment variables
dotenv.config();

const logger = createLogger('ServiceConfig');

/**
 * Service Configuration Manager
 * Provides centralized configuration for external services with environment variable support
 * and graceful degradation options.
 */
export class ServiceConfig {
  /**
   * Check if a service should be enabled
   * @param serviceName Name of the service
   * @returns Boolean indicating whether the service should be enabled
   */
  public static isServiceEnabled(serviceName: string): boolean {
    const envVar = `ENABLE_${serviceName.toUpperCase()}`;
    return process.env[envVar] !== 'false';
  }

  /**
   * Get RabbitMQ configuration
   * @returns RabbitMQ configuration object
   */
  public static getRabbitMQConfig(): {
    enabled: boolean;
    host: string;
    port: number;
    user: string;
    password: string;
    vhost: string;
    reconnectAttempts: number;
  } {
    const enabled = this.isServiceEnabled('rabbitmq');
    
    return {
      enabled,
      host: process.env.RABBITMQ_HOST || 'localhost',
      port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
      user: process.env.RABBITMQ_USER || 'guest',
      password: process.env.RABBITMQ_PASS || 'guest',
      vhost: process.env.RABBITMQ_VHOST || '/',
      reconnectAttempts: parseInt(process.env.RABBITMQ_RECONNECT_ATTEMPTS || '10', 10)
    };
  }
  
  /**
   * Get Strapi configuration
   * @returns Strapi configuration object
   */
  public static getStrapiConfig(): {
    enabled: boolean;
    baseUrl: string;
    apiToken: string;
    username?: string;
    password?: string;
  } {
    const enabled = this.isServiceEnabled('strapi');
    
    return {
      enabled,
      baseUrl: process.env.STRAPI_BASE_URL || 'http://localhost:1337',
      apiToken: process.env.STRAPI_API_TOKEN || '',
      username: process.env.STRAPI_USERNAME,
      password: process.env.STRAPI_PASSWORD
    };
  }
  
  /**
   * Get MongoDB configuration
   * @returns MongoDB configuration object
   */
  public static getMongoDBConfig(): {
    uri: string;
    options: Record<string, any>;
  } {
    return {
      uri: process.env.ATLAS_URI || 'mongodb://localhost:27017/sandbox',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        // Other MongoDB options can be added here
      }
    };
  }
  
  /**
   * Log all service configurations (with sensitive data masked)
   * Useful for debugging
   */
  public static logConfigurations(): void {
    // Log RabbitMQ config (mask password)
    const rabbitConfig = this.getRabbitMQConfig();
    logger.info(`RabbitMQ Configuration:
    - Enabled: ${rabbitConfig.enabled}
    - Host: ${rabbitConfig.host}
    - Port: ${rabbitConfig.port}
    - User: ${rabbitConfig.user}
    - Password: ${'*'.repeat(rabbitConfig.password.length)}
    - Reconnect Attempts: ${rabbitConfig.reconnectAttempts}`);
    
    // Log Strapi config (mask tokens and passwords)
    const strapiConfig = this.getStrapiConfig();
    const maskedToken = strapiConfig.apiToken ? 
      `${strapiConfig.apiToken.substring(0, 5)}...${strapiConfig.apiToken.substring(strapiConfig.apiToken.length - 5)}` : 
      'None';
      
    logger.info(`Strapi Configuration:
    - Enabled: ${strapiConfig.enabled}
    - Base URL: ${strapiConfig.baseUrl}
    - API Token: ${maskedToken}
    - Username: ${strapiConfig.username || 'None'}`);
    
    // Log MongoDB config (mask connection string)
    const mongoConfig = this.getMongoDBConfig();
    const maskedUri = mongoConfig.uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    
    logger.info(`MongoDB Configuration:
    - URI: ${maskedUri}`);
  }
}