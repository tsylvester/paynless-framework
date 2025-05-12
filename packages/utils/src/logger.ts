import { LoggerConfig, LogLevel, LogMetadata } from "@paynless/types";

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
      window.addEventListener('error', (event: ErrorEvent) => {
        this.error('Uncaught error', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        });
      });
      
      window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
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
  /*
  private formatLogWithColor(level: LogLevel, message: string, metadata?: LogMetadata): string {
    const timestamp = new Date().toISOString();
    let logString = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    if (metadata && Object.keys(metadata).length > 0) {
      try {
        logString += ` ${JSON.stringify(metadata)}`;
      } catch (error) {
        console.error("[Logger] Error stringifying metadata in formatLogWithColor:", error);
        logString += ` [Metadata unavailable]`;
      }
    }
    return logString;
  }*/
  
  /**
   * Log a debug message
   */
  public debug(message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    if (this.config.enableConsole) {
      // Pass metadata object separately if it exists
      if (metadata) {
        console.debug(`[${new Date().toISOString()}] ${message}`, metadata);
      } else {
        console.debug(`[${new Date().toISOString()}] ${message}`);
      }
    }
    
    // Here you could add additional logging destinations (e.g., Sentry, server API)
  }
  
  /**
   * Log an info message
   */
  public info(message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    if (this.config.enableConsole) {
      // Pass metadata object separately if it exists
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
      // Pass metadata object separately if it exists
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
      // Pass metadata object separately if it exists
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