import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createLogger } from './logger';

// Load environment variables
dotenv.config();

const logger = createLogger('database');

/**
 * Database Connection Manager
 * 
 * Handles MongoDB connection with proper connection pooling, error handling,
 * and reconnection strategies.
 */
class DatabaseConnection {
  private static instance: DatabaseConnection;
  private isConnected = false;
  private connectionAttempts = 0;
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_INTERVAL = 5000; // 5 seconds

  // Private constructor to prevent direct instantiation
  private constructor() {}

  /**
   * Get the singleton instance of DatabaseConnection
   * @returns DatabaseConnection instance
   */
  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  /**
   * Configure mongoose connection settings
   */
  private configureMongoose(): void {
    // Set connection options
    mongoose.set('strictQuery', true);
    
    // Set event listeners for connection status
    mongoose.connection.on('connected', async () => {
      this.isConnected = true;
      this.connectionAttempts = 0;
      logger.info('Connected to MongoDB');
      
      // Remove problematic indexes that might cause issues
      try {
        // await mongoose.connection.db.collection('projects').dropIndex('strapiId_1');
        logger.info('Successfully dropped strapiId_1 index from projects collection');
      } catch (error) {
        // It's okay if the index doesn't exist
        logger.info('Note: strapiId_1 index may not exist or was already removed');
      }

      // Drop the strapiId index from courses collection
      try {
        if (mongoose.connection.db) {
          await mongoose.connection.db.collection('courses').dropIndex('strapiId_1');
          logger.info('Successfully dropped strapiId_1 index from courses collection');
        } else {
          logger.warn('Cannot drop strapiId_1 index: db connection not fully initialized');
        }
      } catch (error) {
        // It's okay if the index doesn't exist
        logger.info(`Note: strapiId_1 index may not exist or was already removed from courses collection: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    mongoose.connection.on('error', (err) => {
      this.isConnected = false;
      logger.error(`MongoDB connection error: ${err}`);
      this.retryConnection();
    });

    mongoose.connection.on('disconnected', () => {
      this.isConnected = false;
      logger.warn('MongoDB disconnected');
      this.retryConnection();
    });

    // Handle application shutdown
    process.on('SIGINT', this.gracefulShutdown.bind(this));
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
  }

  /**
   * Connect to MongoDB
   * @returns Promise that resolves when connected
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      logger.info('Using existing database connection');
      return;
    }

    try {
      this.configureMongoose();

      const uri = process.env.ATLAS_URI;
      
      if (!uri) {
        throw new Error('ATLAS_URI environment variable is not defined');
      }

      // Replace placeholder with actual password if needed
      const processedUri = uri.includes('<db_password>')
        ? uri.replace('<db_password>', process.env.db_password || '')
        : uri;

      // Configure MongoDB connection options
      // - maxPoolSize: Maintain up to 10 socket connections 
      // - serverSelectionTimeoutMS: How long to try selecting a server
      // - socketTimeoutMS: How long inactive connections stay open
      const options = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      };

      await mongoose.connect(processedUri, options);
      this.isConnected = true;
      logger.info('Database connection established');
    } catch (error) {
      logger.error(`Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
      this.retryConnection();
    }
  }

  /**
   * Retry connection with exponential backoff
   */
  private retryConnection(): void {
    if (this.connectionAttempts >= this.MAX_RETRIES) {
      logger.error(`Failed to connect to MongoDB after ${this.MAX_RETRIES} attempts`);
      process.exit(1);
      return;
    }

    this.connectionAttempts++;
    const delay = this.RETRY_INTERVAL * Math.pow(2, this.connectionAttempts - 1);
    
    logger.info(`Retrying connection in ${delay}ms (attempt ${this.connectionAttempts}/${this.MAX_RETRIES})`);
    
    setTimeout(() => {
      this.connect().catch((err) => {
        logger.error(`Retry attempt failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, delay);
  }

  /**
   * Gracefully close the MongoDB connection
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info('Disconnected from MongoDB');
    } catch (error) {
      logger.error(`Error disconnecting from MongoDB: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gracefully shutdown the database connection
   */
  private async gracefulShutdown(): Promise<void> {
    logger.info('Application termination - closing MongoDB connection');
    await this.disconnect();
    process.exit(0);
  }

  /**
   * Check if the database is connected
   * @returns True if connected, false otherwise
   */
  public isConnectedToDatabase(): boolean {
    return this.isConnected;
  }
}

// Export a singleton instance
export const dbConnection = DatabaseConnection.getInstance();

// This section allows the file to be run directly for testing
// It will only execute when this file is run directly (not when imported)
if (require.main === module) {
  (async () => {
    try {
      logger.info('Testing database connection...');
      await dbConnection.connect();
      
      if (dbConnection.isConnectedToDatabase()) {
        logger.info('✅ Successfully connected to the database');
        
        // Check if connection and db are initialized
        if (mongoose.connection && mongoose.connection.db) {
          try {
            // Get database information
            const adminDb = mongoose.connection.db.admin();
            const result = await adminDb.serverStatus();
            logger.info(`MongoDB version: ${result.version}`);
            logger.info(`Connection successful to: ${mongoose.connection.name}`);
          } catch (error) {
            logger.warn('Could not fetch server status (might lack admin privileges)');
            logger.info(`Connection successful to: ${mongoose.connection.name || 'MongoDB'}`);
          }
        } else {
          logger.info('Connection established but database handle not available yet');
        }
      }
      
      // Wait a bit to ensure logs are displayed before disconnecting
      setTimeout(async () => {
        await dbConnection.disconnect();
        logger.info('Test completed');
        process.exit(0);
      }, 1000);
    } catch (error) {
      logger.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  })();
}