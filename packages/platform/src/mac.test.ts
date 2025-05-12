import { describe, it, expect } from 'vitest';
import { getMacCapabilities } from './mac';
import type { OperatingSystem } from '@paynless/types';

describe('getMacCapabilities', () => {
  it('should return correct macOS stub capabilities structure', () => {
    const capabilities = getMacCapabilities();
    expect(capabilities.os).toBe('macos');
    expect(capabilities.fileSystem.isAvailable).toBe(false);
    expect((capabilities.fileSystem as any).readFile).toBeUndefined();
  });
}); 