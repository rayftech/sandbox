// src/utils/retry.util.ts
import { createLogger } from '../config/logger';

const logger = createLogger('RetryUtility');

/**
 * Options for retry operation
 */
export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 5,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  factor: 2, // Exponential backoff factor
};

/**
 * Utility class for handling retries with exponential backoff
 */
export class RetryUtility {
  /**
   * Execute an operation with retry logic
   * @param operation Function to retry
   * @param options Retry options
   * @returns Promise resolving to operation result
   */
  public static async withRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const config = { ...DEFAULT_OPTIONS, ...options };
    
    // Initialize lastError with a default error
    let lastError: Error = new Error('Operation failed with no specific error');
    let attempt = 0;

    while (attempt < config.maxRetries) {
      try {
        return await operation();
      } catch (err) {
        attempt++;
        lastError = err instanceof Error ? err : new Error(String(err));
        
        if (attempt >= config.maxRetries) {
          logger.error(`All retry attempts failed (${attempt}/${config.maxRetries})`);
          break;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          config.initialDelay * Math.pow(config.factor, attempt - 1),
          config.maxDelay
        );
        const jitter = Math.random() * 0.3 * delay; // Add up to 30% jitter
        const waitTime = Math.floor(delay + jitter);
        
        logger.warn(`Retry attempt ${attempt}/${config.maxRetries} failed. Retrying in ${Math.round(waitTime / 1000)} seconds.`);
        logger.debug(`Error: ${lastError.message}`);
        
        // Call onRetry callback if provided
        if (config.onRetry) {
          config.onRetry(lastError, attempt);
        }
        
        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // All retries failed
    throw lastError;
  }

  /**
   * Execute an operation with retry and return a result or fallback value on failure
   * @param operation Function to retry
   * @param fallbackValue Value to return if all retries fail
   * @param options Retry options
   * @returns Promise resolving to operation result or fallback value
   */
  public static async withRetryOrFallback<T>(
    operation: () => Promise<T>,
    fallbackValue: T,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    try {
      return await RetryUtility.withRetry(operation, options);
    } catch (error) {
      logger.warn(`Operation failed after all retries, returning fallback value`);
      return fallbackValue;
    }
  }
  
  /**
   * Queue an operation for background retry without blocking
   * This is useful for fire-and-forget operations that should not block the main flow
   * @param operation Function to retry
   * @param options Retry options
   * @returns Promise that resolves immediately with void
   */
  public static queueBackgroundRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): void {
    // Execute operation in background without awaiting
    RetryUtility.withRetry(operation, options).catch(error => {
      logger.error(`Background operation failed after all retries: ${error.message}`);
    });
  }
}