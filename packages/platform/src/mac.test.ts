import { describe, it, expect } from 'vitest';
import { mac } from './mac';

describe('mac', () => {
  it('should report fileSystem as unavailable', () => {
    expect(mac.isAvailable).toBe(false);
  });

  // Add tests for any *actual* web capabilities if implemented later
}); 