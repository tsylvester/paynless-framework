import { vi } from 'vitest';

// Mock functions for the logger interface
export const mockLoggerDebug = vi.fn();
export const mockLoggerInfo = vi.fn();
export const mockLoggerWarn = vi.fn();
export const mockLoggerError = vi.fn();
export const mockLoggerConfigure = vi.fn();

// Optional: A helper to reset all mocks if needed
export const resetLoggerMocks = () => {
  mockLoggerDebug.mockClear();
  mockLoggerInfo.mockClear();
  mockLoggerWarn.mockClear();
  mockLoggerError.mockClear();
  mockLoggerConfigure.mockClear();
}; 