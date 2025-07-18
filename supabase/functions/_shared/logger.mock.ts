import type { ILogger, LogMetadata } from "./types.ts";

/**
 * A mock implementation of the ILogger interface for testing purposes.
 * It provides empty implementations for all logging methods.
 * In tests, you can create spies on the methods of an instance of this class.
 *
 * @example
 * import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
 * const mockLogger = new MockLogger();
 * const infoSpy = spy(mockLogger, "info");
 * // ... then use mockLogger and assert calls on infoSpy
 */
export class MockLogger implements ILogger {
    public debug(_message: string, _metadata?: LogMetadata): void {
        // No-op for mock
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
} 