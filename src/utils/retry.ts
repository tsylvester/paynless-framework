import { logger } from './logger';

interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay?: number;
  factor?: number;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const defaultOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 300,
  maxDelay: 10000,
  factor: 2,
};

/**
 * Executes a function with exponential backoff retry logic
 * @param fn The async function to execute
 * @param options Retry configuration options
 * @returns Result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const config = { ...defaultOptions, ...options };
  let attempt = 0;
  let delay = config.initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      
      // If we've exceeded max retries, throw the error
      if (attempt >= config.maxRetries) {
        logger.debug(`Retry failed after ${attempt} attempts`);
        throw error;
      }

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * (config.factor || 2), config.maxDelay || Infinity);
      
      // Log retry attempt
      logger.debug(`Retry attempt ${attempt}/${config.maxRetries} after ${delay}ms`);
      
      // Notify if callback provided
      if (config.onRetry) {
        config.onRetry(attempt, error as Error, delay);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Determines if an error is retryable based on common patterns
 */
export function isRetryableError(error: any): boolean {
  // Network errors are typically retryable
  if (
    error.message?.includes('network') || 
    error.message?.includes('timeout') ||
    error.message?.includes('connection') ||
    error.code === 'ECONNRESET' ||
    error.code === 'ETIMEDOUT' ||
    error.status === 429 || // Too Many Requests
    (error.status >= 500 && error.status < 600) // Server errors
  ) {
    return true;
  }
  
  return false;
}