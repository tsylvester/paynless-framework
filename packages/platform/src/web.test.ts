import { describe, it, expect } from 'vitest';
import { web } from './web';

describe('web', () => {
  it('should report fileSystem as unavailable', () => {
    expect(web.isAvailable).toBe(false);
  });

  // Add tests for any *actual* web capabilities if implemented later
}); 