// Entry point for the application
import { createLogger } from './config/logger';
import { startServer } from './server';

const logger = createLogger('Main');

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