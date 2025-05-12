import { describe, it, expect } from 'vitest';
import { getWebCapabilities } from './web';
import type { OperatingSystem } from '@paynless/types'; // Import for type checking

// Define possible OS values for checking
const possibleOS: OperatingSystem[] = [
  'windows', 'macos', 'linux', 'ios', 'android', 'unknown'
];

describe('getWebCapabilities', () => {
  it('should return correct web capabilities structure', () => {
    const capabilities = getWebCapabilities();

    // Check platform
    expect(capabilities.platform).toBe('web');

    // Check filesystem
    expect(capabilities.fileSystem.isAvailable).toBe(false);
    // Ensure no FS methods are present (type safety check)
    expect((capabilities.fileSystem as any).readFile).toBeUndefined();

    // Check OS (should be one of the valid types, likely 'unknown' in test env)
    expect(possibleOS).toContain(capabilities.os);
  });
}); 