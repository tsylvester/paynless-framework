import { describe, it, expect } from 'vitest';
import { ios } from './ios';

describe('ios', () => {
  it('should report fileSystem as unavailable', () => {
    expect(ios.isAvailable).toBe(false);
  });

  // Add tests for any *actual* web capabilities if implemented later
}); 