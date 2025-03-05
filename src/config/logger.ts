import winston from 'winston';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Determine if we're in production mode
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Create a logger instance with custom configuration
 * @param module Name of the module using the logger
 * @returns Winston logger instance
 */
export function createLogger(module: string) {
  // Define log format
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
    winston.format.printf(({ level, message, timestamp, service, ...meta }) => {
      return `${timestamp} [${service}] ${level.toUpperCase()}: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
      }`;
    })
  );

  // Create a custom logger
  const logger = winston.createLogger({
    level: isProduction ? 'info' : 'debug',
    defaultMeta: { service: module },
    format: logFormat,
    transports: [
      // Write logs to console
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
      
      // Write all logs with level 'error' and below to error.log
      new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error' 
      }),
      
      // Write all logs to combined.log
      new winston.transports.File({ 
        filename: 'logs/combined.log' 
      }),
    ],
  });

  return logger;
}

// Create a default application logger
export const logger = createLogger('app');