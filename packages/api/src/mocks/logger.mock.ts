import { vi } from 'vitest';
import type { ILogger, LogMetadata } from '@paynless/types';

// Define types for arguments once
type DebugArgs = [message: string, metadata?: LogMetadata];
type InfoArgs = [message: string, metadata?: LogMetadata];
type WarnArgs = [message: string, metadata?: LogMetadata];
type ErrorArgs = [message: string | Error, metadata?: LogMetadata];

// Create the actual mock functions that will be held by variables
const debugSpy = vi.fn<DebugArgs, void>();
const infoSpy = vi.fn<InfoArgs, void>();
const warnSpy = vi.fn<WarnArgs, void>();
const errorSpy = vi.fn<ErrorArgs, void>();

export const mockLogger: ILogger = {
  debug: debugSpy,
  info: infoSpy,
  warn: warnSpy,
  error: errorSpy,
};

export const resetMockLogger = () => {
  debugSpy.mockClear();
  infoSpy.mockClear();
  warnSpy.mockClear();
  errorSpy.mockClear();

  // If a full reset (like .mockReset()) is needed, also reset implementations/return values:
  // debugSpy.mockImplementation(() => undefined);
  // infoSpy.mockImplementation(() => undefined);
  // warnSpy.mockImplementation(() => undefined);
  // errorSpy.mockImplementation(() => undefined);
};

// Optional: Export the instances if tests need to make assertions on them directly
// (e.g., expect(debugMockInstance).toHaveBeenCalledWith(...))
// export const __INTERNAL_MOCK_INSTANCES__ = {
//   debugMockInstance,
//   infoMockInstance,
//   warnMockInstance,
//   errorMockInstance,
// };
