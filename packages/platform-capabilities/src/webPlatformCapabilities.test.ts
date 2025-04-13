import { describe, it, expect } from 'vitest';
import { webFileSystemCapabilities } from './webPlatformCapabilities';

describe('webPlatformCapabilities', () => {
  it('should report fileSystem as unavailable', () => {
    expect(webFileSystemCapabilities.isAvailable).toBe(false);
  });

  // Add tests for any *actual* web capabilities if implemented later
}); 