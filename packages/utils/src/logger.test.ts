import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, Logger, LogLevel } from './logger'; // Adjust path if needed

// Mock console methods
const consoleSpies = {
  debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
  info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
};

describe('Logger', () => {
  let testLogger: Logger;

  beforeEach(() => {
    // Reset mocks and logger configuration before each test
    vi.clearAllMocks();
    // Get a fresh instance or reset the existing singleton
    // Assuming logger is exported as a pre-configured singleton instance
    // We need a way to reconfigure it for tests. Let's assume a configure method exists
    testLogger = logger; // Use the exported singleton
    // Reset to default config (or desired test defaults)
    testLogger.configure({ minLevel: LogLevel.DEBUG, enableConsole: true });
  });

  afterEach(() => {
    // Restore original console methods if needed, though clearAllMocks usually handles it
  });

  it('should be a singleton instance', () => {
    const instance1 = Logger.getInstance();
    const instance2 = Logger.getInstance();
    expect(instance1).toBe(instance2);
    expect(instance1).toBe(testLogger);
  });

  it('should log messages at or above minLevel (DEBUG)', () => {
    testLogger.debug('debug message');
    testLogger.info('info message');
    testLogger.warn('warn message');
    testLogger.error('error message');

    expect(consoleSpies.debug).toHaveBeenCalledOnce();
    expect(consoleSpies.info).toHaveBeenCalledOnce();
    expect(consoleSpies.warn).toHaveBeenCalledOnce();
    expect(consoleSpies.error).toHaveBeenCalledOnce();
  });

  it('should NOT log messages below minLevel (INFO)', () => {
    testLogger.configure({ minLevel: LogLevel.INFO });

    testLogger.debug('debug message'); // Should be skipped
    testLogger.info('info message');
    testLogger.warn('warn message');
    testLogger.error('error message');

    expect(consoleSpies.debug).not.toHaveBeenCalled();
    expect(consoleSpies.info).toHaveBeenCalledOnce();
    expect(consoleSpies.warn).toHaveBeenCalledOnce();
    expect(consoleSpies.error).toHaveBeenCalledOnce();
  });
  
  it('should NOT log messages below minLevel (WARN)', () => {
    testLogger.configure({ minLevel: LogLevel.WARN });

    testLogger.debug('debug message'); 
    testLogger.info('info message'); 
    testLogger.warn('warn message');
    testLogger.error('error message');

    expect(consoleSpies.debug).not.toHaveBeenCalled();
    expect(consoleSpies.info).not.toHaveBeenCalled();
    expect(consoleSpies.warn).toHaveBeenCalledOnce();
    expect(consoleSpies.error).toHaveBeenCalledOnce();
  });

    it('should NOT log messages below minLevel (ERROR)', () => {
    testLogger.configure({ minLevel: LogLevel.ERROR });

    testLogger.debug('debug message'); 
    testLogger.info('info message'); 
    testLogger.warn('warn message');
    testLogger.error('error message');

    expect(consoleSpies.debug).not.toHaveBeenCalled();
    expect(consoleSpies.info).not.toHaveBeenCalled();
    expect(consoleSpies.warn).not.toHaveBeenCalled();
    expect(consoleSpies.error).toHaveBeenCalledOnce();
  });

  it('should include metadata when provided', () => {
    const metadata = { userId: 123, operation: 'test' };
    testLogger.info('info with metadata', metadata);

    expect(consoleSpies.info).toHaveBeenCalledOnce();
    // Check if the arguments passed to console.info include the message and metadata
    // Vitest's toHaveBeenCalledWith can check complex arguments
    expect(consoleSpies.info).toHaveBeenCalledWith(expect.stringContaining('info with metadata'), metadata);
  });

  it('should not log to console if enableConsole is false', () => {
    testLogger.configure({ enableConsole: false });

    testLogger.info('info message - console disabled');

    expect(consoleSpies.info).not.toHaveBeenCalled();
  });

  // TODO: Add tests for error capturing if implemented
}); 