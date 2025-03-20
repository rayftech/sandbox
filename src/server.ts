// src/server.ts
import http from 'http';
import dotenv from 'dotenv';
import app from './app';
import { createLogger } from './config/logger';
import { dbConnection } from './config/database';
import { UserConsumerService } from './services/user.consumer.service';
import { EventPublisher } from './services/event.publisher';
import { StrapiConsumerService } from './services/strapi-consumer.service';
import { RequestResponseService } from './services/request-response.service';

// Load environment variables
dotenv.config();

const logger = createLogger('Server');

// Get port from environment variable or default to 5050
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

/**
 * Initialize message services
 */
async function initializeMessageServices() {
  try {
    // Initialize event publisher
    await EventPublisher.getInstance().initialize();
    logger.info('Event publisher initialized');
    
    // Initialize user consumer
    await UserConsumerService.getInstance().initialize();
    logger.info('User consumer service initialized');
    
    // Initialize request-response service
    await RequestResponseService.getInstance().initialize();
    logger.info('Request-Response service initialized');
    
    // Initialize Strapi consumer service to handle Strapi operations
    await StrapiConsumerService.getInstance().initialize();
    logger.info('Strapi consumer service initialized');
  } catch (error) {
    logger.error(`Failed to initialize message services: ${error instanceof Error ? error.message : String(error)}`);
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
 * Initialize the server
 */
async function startServer() {
  try {
    // Connect to database
    await dbConnection.connect();
    
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