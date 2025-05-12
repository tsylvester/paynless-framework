import { describe, it, expect } from 'vitest';
import { getLinuxCapabilities } from './linux';
import type { OperatingSystem } from '@paynless/types'; // Import for type checking

describe('getLinuxCapabilities', () => {
  it('should return correct Linux stub capabilities structure', () => {
    const capabilities = getLinuxCapabilities();

    // Check OS
    expect(capabilities.os).toBe('linux');

    // Check filesystem (should be unavailable in stub)
    expect(capabilities.fileSystem.isAvailable).toBe(false);
    // Ensure no FS methods are present (type safety check)
    expect((capabilities.fileSystem as any).readFile).toBeUndefined();

    // Platform might be 'web' or 'tauri' depending on stub details, 
    // OS and unavailable FS are the key checks for now.
  });
}); 