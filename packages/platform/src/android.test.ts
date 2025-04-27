import { describe, it, expect } from 'vitest';
import { android } from './android';

describe('android', () => {
  it('should report fileSystem as unavailable', () => {
    expect(android.isAvailable).toBe(false);
  });

  // Add tests for any *actual* web capabilities if implemented later
}); 