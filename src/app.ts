import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { logger } from './config/logger';
// import { errorHandler } from './middlewares/error.middleware';
import routes from './routes';

/**
 * Express application class
 * Sets up the Express app with all middleware and routes
 */
export class App {
  public app: Application;

  /**
   * Initialize the Express application
   */
  constructor() {
    this.app = express();
    this.configureMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Configure all middleware for the Express app
   */
  private configureMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS setup
    this.app.use(cors());
    
    // Request parsing
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // HTTP request logging
    const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
    this.app.use(morgan(morganFormat, {
      stream: {
        write: (message: string) => {
          logger.info(message.trim());
        }
      }
    }));
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    this.app.use('/api', routes);
    
    // Health check endpoint - use underscore prefix to ignore unused parameter
    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'OK', uptime: process.uptime() });
    });
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    // Handle 404 errors - use underscore prefix to ignore unused parameter
    this.app.use((req: Request, res: Response, _next: NextFunction) => {
      res.status(404).json({
        status: 'error',
        message: `Cannot ${req.method} ${req.path}`
      });
    });
    
    // // Global error handler
    // this.app.use(errorHandler);
  }
}

// Create and export the Express app
export default new App().app;