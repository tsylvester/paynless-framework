import { describe, it, expect } from 'vitest';
import { getIosCapabilities } from './ios';
import type { OperatingSystem } from '@paynless/types';

describe('getIosCapabilities', () => {
  it('should return correct iOS stub capabilities structure', () => {
    const capabilities = getIosCapabilities();
    expect(capabilities.os).toBe('ios');
    expect(capabilities.fileSystem.isAvailable).toBe(false);
    expect((capabilities.fileSystem as any).readFile).toBeUndefined();
  });
}); 