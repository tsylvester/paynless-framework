import { describe, it, expect, beforeEach } from 'vitest';
import { NullAnalyticsAdapter } from './nullAdapter';

describe('NullAnalyticsAdapter', () => {
  let adapter: NullAnalyticsAdapter;

  beforeEach(() => {
    adapter = new NullAnalyticsAdapter();
  });

  it('should instantiate without errors', () => {
    expect(adapter).toBeInstanceOf(NullAnalyticsAdapter);
  });

  it('should have an identify method that does nothing', () => {
    expect(() => adapter.identify('user123', { email: 'test@example.com' })).not.toThrow();
  });

  it('should have a track method that does nothing', () => {
    expect(() => adapter.track('testEvent', { prop: 'value' })).not.toThrow();
  });

  it('should have a reset method that does nothing', () => {
    expect(() => adapter.reset()).not.toThrow();
  });

  it('should have an optInTracking method (optional) that does nothing', () => {
    expect(() => adapter.optInTracking?.()).not.toThrow();
  });

  it('should have an optOutTracking method (optional) that does nothing', () => {
    expect(() => adapter.optOutTracking?.()).not.toThrow();
  });

  it('should have an isFeatureEnabled method (optional) that returns false', () => {
    expect(adapter.isFeatureEnabled?.('test-flag')).toBe(false);
    expect(() => adapter.isFeatureEnabled?.('test-flag')).not.toThrow();
  });
}); 