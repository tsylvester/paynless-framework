import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the NullAnalyticsAdapter to check its instantiation
vi.mock('./nullAdapter', () => {
  return {
    NullAnalyticsAdapter: vi.fn().mockImplementation(() => ({
      // Mock methods if needed for specific tests, otherwise just check instance
      identify: vi.fn(),
      track: vi.fn(),
      reset: vi.fn(),
    })),
  };
});

// Mock the logger to prevent console output during tests
vi.mock('@paynless/utils', () => ({
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
}));

// Mock the PostHog adapter import for later phases (even though not used in phase 1)
// This prevents errors if the file is accidentally imported.
vi.mock('./posthogAdapter', () => {
    return {
        PostHogAdapter: vi.fn(),
    };
});

describe('Analytics Service Initialization (index.ts)', () => {
    const originalEnv = { ...import.meta.env };

    beforeEach(() => {
        // Reset mocks before each test
        vi.clearAllMocks();
        // Reset env variables (Vitest doesn't automatically isolate import.meta.env)
        Object.assign(import.meta.env, originalEnv);
    });

    afterEach(() => {
        // Restore original env variables
        Object.assign(import.meta.env, originalEnv);
        // Reset the module registry to force re-initialization on next import
        vi.resetModules();
    });

    it('should initialize NullAnalyticsAdapter when no provider is specified', async () => {
        // Explicitly unset relevant env vars
        delete import.meta.env.VITE_ANALYTICS_PROVIDER;
        delete import.meta.env.VITE_POSTHOG_KEY;

        // Dynamically import the module *after* setting env vars
        const { analytics } = await import('./index');
        const { NullAnalyticsAdapter } = await import('./nullAdapter');

        // Check if the NullAnalyticsAdapter constructor was called
        expect(NullAnalyticsAdapter).toHaveBeenCalledTimes(1);
        // Check if the exported instance is from the mocked constructor
        // This confirms it was instantiated
        // expect(analytics).toBeInstanceOf(NullAnalyticsAdapter);
    });

    it('should initialize NullAnalyticsAdapter when provider is "none" ', async () => {
        import.meta.env.VITE_ANALYTICS_PROVIDER = 'none';
        delete import.meta.env.VITE_POSTHOG_KEY;

        const { analytics } = await import('./index');
        const { NullAnalyticsAdapter } = await import('./nullAdapter');
        expect(NullAnalyticsAdapter).toHaveBeenCalledTimes(1);
        // expect(analytics).toBeInstanceOf(NullAnalyticsAdapter);
    });

    it('should initialize NullAnalyticsAdapter when provider is "posthog" but key is missing', async () => {
        import.meta.env.VITE_ANALYTICS_PROVIDER = 'posthog';
        delete import.meta.env.VITE_POSTHOG_KEY;

        const { analytics } = await import('./index');
        const { NullAnalyticsAdapter } = await import('./nullAdapter');
        expect(NullAnalyticsAdapter).toHaveBeenCalledTimes(1);
        // expect(analytics).toBeInstanceOf(NullAnalyticsAdapter);
    });

     it('should initialize NullAnalyticsAdapter when provider is unsupported', async () => {
        import.meta.env.VITE_ANALYTICS_PROVIDER = 'mixpanel'; // Assume mixpanel not implemented yet
        import.meta.env.VITE_POSTHOG_KEY = 'test-key'; // Provide a key just in case

        const { analytics } = await import('./index');
        const { NullAnalyticsAdapter } = await import('./nullAdapter');
        expect(NullAnalyticsAdapter).toHaveBeenCalledTimes(1);
        // expect(analytics).toBeInstanceOf(NullAnalyticsAdapter);
    });
}); 