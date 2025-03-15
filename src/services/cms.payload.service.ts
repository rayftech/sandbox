// src/services/payload.service.ts
import payload from 'payload';
import { Express } from 'express';
import { createLogger } from '../config/logger';

export class PayloadService {
  private static instance: PayloadService;
  private initialized: boolean = false;
  private logger = createLogger('PayloadService');

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): PayloadService {
    if (!PayloadService.instance) {
      PayloadService.instance = new PayloadService();
    }
    return PayloadService.instance;
  }

  /**
   * Initialize Payload CMS
   * @param app Express application instance
   */
  public async initialize(app: Express): Promise<void> {
    if (this.initialized) {
      this.logger.info('Payload CMS already initialized');
      return;
    }

    try {
      // Initialize Payload with just the Express app
      await payload.init({
        express: app,
      });
      
      this.initialized = true;
      this.logger.info('Payload CMS initialized successfully');
      this.logger.info(`Admin URL: http://localhost:${process.env.PORT || 3000}/admin`);
    } catch (error) {
      this.logger.error(`Failed to initialize Payload CMS: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Shutdown Payload CMS
   */
  public async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      // Payload doesn't have an explicit shutdown method currently
      this.logger.info('Payload CMS shutdown completed');
      this.initialized = false;
    } catch (error) {
      this.logger.error(`Error shutting down Payload CMS: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}