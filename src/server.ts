// src/server.ts
import http from 'http';
import app from './app';
import { createLogger } from './config/logger';
import { dbConnection } from './config/database';
import { UserConsumerService } from './services/user.consumer.service';
import { EventPublisher } from './services/event.publisher';
import { StrapiConsumerService } from './services/strapi-consumer.service';
import { RequestResponseService } from './services/request-response.service';
import { ServiceConfig } from './config/service-config';

const logger = createLogger('Server');

// Get port from environment variable or default to 3000
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

/**
 * Initialize message services with improved error handling
 */
async function initializeMessageServices() {
  try {
    // Log all service configurations (with sensitive data masked)
    ServiceConfig.logConfigurations();

    // Get RabbitMQ configuration
    const rabbitConfig = ServiceConfig.getRabbitMQConfig();
    const strapiConfig = ServiceConfig.getStrapiConfig();

    // Initialize services based on their enabled status
    let servicesInitialized = 0;
    let servicesFailed = 0;

    // Initialize event publisher if RabbitMQ is enabled
    if (rabbitConfig.enabled) {
      try {
        await EventPublisher.getInstance().initialize();
        logger.info('Event publisher initialized');
        servicesInitialized++;
      } catch (error) {
        logger.error(`Failed to initialize Event Publisher: ${error instanceof Error ? error.message : String(error)}`);
        servicesFailed++;
      }
    } else {
      logger.info('Event Publisher disabled by configuration');
    }
    
    // Initialize user consumer if RabbitMQ is enabled
    if (rabbitConfig.enabled) {
      try {
        await UserConsumerService.getInstance().initialize();
        logger.info('User consumer service initialized');
        servicesInitialized++;
      } catch (error) {
        logger.error(`Failed to initialize User Consumer: ${error instanceof Error ? error.message : String(error)}`);
        servicesFailed++;
      }
    } else {
      logger.info('User Consumer disabled by configuration');
    }
    
    // Initialize request-response service if RabbitMQ is enabled
    if (rabbitConfig.enabled) {
      try {
        await RequestResponseService.getInstance().initialize();
        logger.info('Request-Response service initialized');
        servicesInitialized++;
      } catch (error) {
        logger.error(`Failed to initialize Request-Response service: ${error instanceof Error ? error.message : String(error)}`);
        servicesFailed++;
      }
    } else {
      logger.info('Request-Response service disabled by configuration');
    }
    
    // Initialize Strapi consumer service if both Strapi and RabbitMQ are enabled
    if (strapiConfig.enabled && rabbitConfig.enabled) {
      try {
        await StrapiConsumerService.getInstance().initialize();
        logger.info('Strapi consumer service initialized');
        servicesInitialized++;
      } catch (error) {
        logger.error(`Failed to initialize Strapi consumer: ${error instanceof Error ? error.message : String(error)}`);
        servicesFailed++;
      }
    } else {
      logger.info('Strapi Consumer service disabled by configuration');
    }

    // Summarize initialization results
    logger.info(`Service initialization complete: ${servicesInitialized} initialized, ${servicesFailed} failed`);
    
    if (servicesFailed > 0) {
      logger.warn('Some services failed to initialize. The application will continue with reduced functionality.');
    }
  } catch (error) {
    logger.error(`Failed during service initialization: ${error instanceof Error ? error.message : String(error)}`);
    logger.warn('Application will continue with reduced functionality');
  }
}

/**
 * Graceful server shutdown
 */
async function gracefulShutdown() {
  logger.info('Received shutdown signal, starting graceful shutdown');

  try {
    // Close database connection
    await dbConnection.disconnect();
    logger.info('Database connections closed');

    // Close HTTP server
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds if server doesn't close
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);

  } catch (error) {
    logger.error(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Initialize the server with improved error handling
 */
async function startServer() {
  try {
    // Connect to database
    await dbConnection.connect();
    logger.info('Database connection established');
    
    // Initialize message services
    await initializeMessageServices();
    
    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // Handle process termination
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Start the server
startServer().catch((err) => {
  logger.error(`Unhandled error starting server: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Promise Rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  // Don't exit here to keep the server running, but log for monitoring
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  // Exit with error - uncaught exceptions leave app in undefined state
  process.exit(1);
});