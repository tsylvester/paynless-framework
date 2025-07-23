import { type LogMetadata, LogLevel, type LoggerConfig } from "./types.ts";
import { ILogger } from './types.ts';

/**
 * A mock implementation of the Logger class for testing purposes.
 * It mimics the public interface of the real Logger but silences output.
 * In tests, you can create spies on the methods of an instance of this class.
 *
 * @example
 * import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
 * const mockLogger = new MockLogger();
 * const infoSpy = spy(mockLogger, "info");
 * // ... then use mockLogger and assert calls on infoSpy
 */
export class MockLogger implements ILogger {
    private config: LoggerConfig;

    public constructor() {
        // Initialize config with test-friendly defaults that disable actual output.
        this.config = {
            minLevel: LogLevel.DEBUG,
            enableConsole: false,
            captureErrors: false,
        }
    }

    public debug(_message: string, _metadata?: LogMetadata): void {
        // No-op for mock, but can be spied on
    }
    public info(_message: string, _metadata?: LogMetadata): void {
        // No-op for mock
    }
    public warn(_message: string, _metadata?: LogMetadata): void {
        // No-op for mock
    }
    public error(_message: string | Error, _metadata?: LogMetadata): void {
        // No-op for mock
    }

    public configure(config: Partial<LoggerConfig>): void {
        this.config = { ...this.config, ...config };
    }

    public shouldLog(_level: LogLevel): boolean {
        // Always return true in mock to allow spies to capture any call.
        return true; 
    }
}