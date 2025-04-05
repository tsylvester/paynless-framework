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
  captureErrors: boolean;
}

/**
 * Interface for log entry metadata
 */
export interface LogMetadata {
  [key: string]: unknown;
}

/**
 * Logging service for application-wide logging
 */
export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  
  private constructor() {
    // Default configuration
    this.config = {
      minLevel: LogLevel.INFO,
      enableConsole: true,
      captureErrors: true,
    };
    
    // Set up error handling
    if (this.config.captureErrors) {
      this.setupGlobalErrorHandling();
    }
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
   * Set up global error handling
   */
  private setupGlobalErrorHandling(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.error('Uncaught error', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        });
      });
      
      window.addEventListener('unhandledrejection', (event) => {
        this.error('Unhandled promise rejection', {
          reason: event.reason,
          stack: event.reason?.stack,
        });
      });
    }
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
   * Format a log message with metadata
   */
  private formatLog(message: string, metadata?: LogMetadata): string {
    const timestamp = new Date().toISOString();
    const metadataStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
    
    return `[${timestamp}] ${message}${metadataStr}`;
  }
  
  /**
   * Log a debug message
   */
  public debug(message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    if (this.config.enableConsole) {
      console.debug(this.formatLog(message, metadata));
    }
    
    // Here you could add additional logging destinations (e.g., Sentry, server API)
  }
  
  /**
   * Log an info message
   */
  public info(message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    if (this.config.enableConsole) {
      console.info(this.formatLog(message, metadata));
    }
  }
  
  /**
   * Log a warning message
   */
  public warn(message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    if (this.config.enableConsole) {
      console.warn(this.formatLog(message, metadata));
    }
  }
  
  /**
   * Log an error message
   */
  public error(message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    if (this.config.enableConsole) {
      console.error(this.formatLog(message, metadata));
    }
  }
}

// Export a singleton instance
export const logger = Logger.getInstance();