// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
/**
 * Logging levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Configuration for the logger
 */
export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  // captureErrors is removed as window is not available
}

/**
 * Interface for log entry metadata
 */
export interface LogMetadata {
  [key: string]: unknown;
}

/**
 * Logging service - Simplified for Deno Edge Functions
 */
export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  
  private constructor() {
    // Default configuration for server-side functions
    this.config = {
      minLevel: LogLevel.INFO, // Default to INFO on server
      enableConsole: true,
    };
  }
  
  /**
   * Get the singleton instance of the logger
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  /**
   * Configure the logger
   */
  public configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Check if the given log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const configLevelIndex = levels.indexOf(this.config.minLevel);
    const logLevelIndex = levels.indexOf(level);
    return logLevelIndex >= configLevelIndex;
  }
  
  /**
   * Log a debug message
   */
  public debug(message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    if (this.config.enableConsole) {
      if (metadata) {
        console.debug(`[${new Date().toISOString()}] ${message}`, metadata);
      } else {
        console.debug(`[${new Date().toISOString()}] ${message}`);
      }
    }
  }
  
  /**
   * Log an info message
   */
  public info(message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    if (this.config.enableConsole) {
      if (metadata) {
        console.info(`[${new Date().toISOString()}] ${message}`, metadata);
      } else {
        console.info(`[${new Date().toISOString()}] ${message}`);
      }
    }
  }
  
  /**
   * Log a warning message
   */
  public warn(message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    if (this.config.enableConsole) {
      if (metadata) {
        console.warn(`[${new Date().toISOString()}] ${message}`, metadata);
      } else {
        console.warn(`[${new Date().toISOString()}] ${message}`);
      }
    }
  }
  
  /**
   * Log an error message
   */
  public error(message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    if (this.config.enableConsole) {
      if (metadata) {
        console.error(`[${new Date().toISOString()}] ${message}`, metadata);
      } else {
        console.error(`[${new Date().toISOString()}] ${message}`);
      }
    }
  }
}

// Export a singleton instance
export const logger = Logger.getInstance(); 