import { vi } from 'vitest';
import type { ILogger, LogMetadata } from '@paynless/types';

// Define types for arguments once
type DebugArgs = [message: string, metadata?: LogMetadata];
type InfoArgs = [message: string, metadata?: LogMetadata];
type WarnArgs = [message: string, metadata?: LogMetadata];
type ErrorArgs = [message: string | Error, metadata?: LogMetadata];

// Create the actual mock functions that will be held by variables
const debugMockInstance = vi.fn<DebugArgs, void>();
const infoMockInstance = vi.fn<InfoArgs, void>();
const warnMockInstance = vi.fn<WarnArgs, void>();
const errorMockInstance = vi.fn<ErrorArgs, void>();

export const mockLogger: ILogger = {
  // The logger methods call the underlying mock instances
  debug: (...args: DebugArgs) => debugMockInstance(...args),
  info: (...args: InfoArgs) => infoMockInstance(...args),
  warn: (...args: WarnArgs) => warnMockInstance(...args),
  error: (...args: ErrorArgs) => errorMockInstance(...args),
};

export const resetMockLogger = () => {
  // Call mockClear on the instances themselves
  debugMockInstance.mockClear();
  infoMockInstance.mockClear();
  warnMockInstance.mockClear();
  errorMockInstance.mockClear();

  // If a full reset (like .mockReset()) is needed, also reset implementations/return values:
  // debugMockInstance.mockImplementation(() => undefined);
  // infoMockInstance.mockImplementation(() => undefined);
  // warnMockInstance.mockImplementation(() => undefined);
  // errorMockInstance.mockImplementation(() => undefined);
  // Or, re-assign them:
  // debugMockInstance = vi.fn<DebugArgs, void>();
  // infoMockInstance = vi.fn<InfoArgs, void>();
  // warnMockInstance = vi.fn<WarnArgs, void>();
  // errorMockInstance = vi.fn<ErrorArgs, void>();
};

// Optional: Export the instances if tests need to make assertions on them directly
// (e.g., expect(debugMockInstance).toHaveBeenCalledWith(...))
// export const __INTERNAL_MOCK_INSTANCES__ = {
//   debugMockInstance,
//   infoMockInstance,
//   warnMockInstance,
//   errorMockInstance,
// };
