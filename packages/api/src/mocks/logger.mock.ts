import { vi, type Mock } from 'vitest';
import type { ILogger } from '@paynless/types';

export const mockLogger: ILogger = {
  info: vi.fn() as Mock<[string, ...any[]], void>,
  error: vi.fn() as Mock<[string, ...any[]], void>,
  warn: vi.fn() as Mock<[string, ...any[]], void>,
  debug: vi.fn() as Mock<[string, ...any[]], void>,
};

export const resetMockLogger = () => {
  mockLogger.info.mockClear();
  mockLogger.error.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.debug.mockClear();
};
