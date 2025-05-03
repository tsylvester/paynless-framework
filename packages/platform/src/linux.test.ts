import { describe, it, expect } from 'vitest';
import { linux } from './linux';

describe('linux', () => {
  it('should report fileSystem as unavailable', () => {
    expect(linux.isAvailable).toBe(false);
  });

  // Add tests for any *actual* web capabilities if implemented later
}); 