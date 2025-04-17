import { vi } from 'vitest';

// Mock functions for the AnalyticsClient interface
export const mockAnalyticsTrack = vi.fn();
export const mockAnalyticsIdentify = vi.fn();
export const mockAnalyticsReset = vi.fn();

// Optional: A helper to reset all mocks if needed
export const resetAnalyticsMocks = () => {
  mockAnalyticsTrack.mockClear();
  mockAnalyticsIdentify.mockClear();
  mockAnalyticsReset.mockClear();
}; 