import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../config/logger';

const logger = createLogger('ErrorMiddleware');

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error handler middleware for Express
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  // Default values
  let statusCode = 500;
  let message = 'Internal Server Error';
  let isOperational = false;

  // If it's our ApiError, use its properties
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  } else if (err.name === 'ValidationError') {
    // Handle Mongoose validation errors
    statusCode = 400;
    message = err.message;
    isOperational = true;
  } else if (err.name === 'CastError') {
    // Handle Mongoose casting errors
    statusCode = 400;
    message = 'Invalid input data';
    isOperational = true;
  } else if (err.name === 'MongoServerError' && (err as any).code === 11000) {
    // Handle MongoDB duplicate key error
    statusCode = 409;
    message = 'Duplicate field value entered';
    isOperational = true;
  }

  // Log error
  if (isOperational) {
    logger.warn(`${statusCode} - ${message} - ${req.originalUrl} - ${req.method}`);
  } else {
    logger.error(
      `${statusCode} - ${message} - ${req.originalUrl} - ${req.method}`,
      { error: err.stack }
    );
  }

  // Send response
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    // Include stack trace in development environment
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

/**
 * Middleware to handle 404 not found errors
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const err = new ApiError(404, `Cannot find ${req.originalUrl} on this server`);
  next(err);
};

/**
 * Middleware to handle async errors (prevents unhandled promise rejections)
 * @param fn The async route handler function
 * @returns A function that catches any errors and passes them to the next middleware
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};