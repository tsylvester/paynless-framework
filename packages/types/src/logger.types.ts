/**
 * Interface describing the public contract of a Logger instance.
 */
export interface ILogger {
  debug: (message: string, metadata?: LogMetadata) => void;
  info: (message: string, metadata?: LogMetadata) => void;
  warn: (message: string, metadata?: LogMetadata) => void;
  error: (message: string | Error, metadata?: LogMetadata) => void;
  // setLogLevel?: (level: LogLevel) => void; // Example if needed
}

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
  