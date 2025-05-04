import { describe, it, expect } from 'vitest';
import { getAndroidCapabilities } from './android';
import type { OperatingSystem } from '@paynless/types';

describe('getAndroidCapabilities', () => {
  it('should return correct Android stub capabilities structure', () => {
    const capabilities = getAndroidCapabilities();
    expect(capabilities.os).toBe('android');
    expect(capabilities.fileSystem.isAvailable).toBe(false);
    expect((capabilities.fileSystem as any).readFile).toBeUndefined();
  });
}); 