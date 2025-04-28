import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks ---

// Mock NullAnalyticsAdapter
const mockNullAdapterInstance = {
  identify: vi.fn(),
  track: vi.fn(),
  reset: vi.fn(),
};
const mockNullAnalyticsAdapterConstructor = vi.fn().mockImplementation(() => mockNullAdapterInstance);
vi.mock('./nullAdapter', () => ({
  NullAnalyticsAdapter: mockNullAnalyticsAdapterConstructor,
}));

// Mock PostHogAdapter
const mockPosthogAdapterInstance = {
    init: vi.fn(),
    identify: vi.fn(),
    track: vi.fn(),
    reset: vi.fn(),
};
const mockPostHogAdapterConstructor = vi.fn().mockImplementation(() => mockPosthogAdapterInstance);
vi.mock('./posthogAdapter', () => ({
    PostHogAdapter: mockPostHogAdapterConstructor,
}));

// Mock the logger
vi.mock('@paynless/utils', () => ({
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
}));


describe('Analytics Service Initialization (index.ts)', () => {
    const originalEnv = { ...import.meta.env };
    const posthogKey = 'test-ph-key';
    const posthogHost = 'https://test-ph.host.com';

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset env variables
        for (const key in import.meta.env) {
            if (key.startsWith('VITE_')) { // Be careful not to delete other env vars
                delete (import.meta.env as any)[key];
            }
        }
        Object.assign(import.meta.env, originalEnv); // Restore originals just in case
        // Reset the module registry to force re-initialization on next import
        vi.resetModules();
    });

    afterEach(() => {
        // Restore original env variables fully
        Object.assign(import.meta.env, originalEnv);
    });

    // --- Null Adapter Tests (Phase 1) ---
    it('should initialize NullAnalyticsAdapter when no provider is specified', async () => {
        // Explicitly unset relevant env vars
        delete (import.meta.env as any)['VITE_ANALYTICS_PROVIDER'];
        delete (import.meta.env as any)['VITE_POSTHOG_KEY'];

        const { analytics } = await import('./index');
        // Check constructor calls
        expect(mockNullAnalyticsAdapterConstructor).toHaveBeenCalledTimes(1);
        expect(mockPostHogAdapterConstructor).not.toHaveBeenCalled();
        // Check exported instance type (based on which constructor was called)
        expect(analytics).toBe(mockNullAdapterInstance);
    });

    it('should initialize NullAnalyticsAdapter when provider is "none" ', async () => {
        (import.meta.env as any)['VITE_ANALYTICS_PROVIDER'] = 'none';
        delete (import.meta.env as any)['VITE_POSTHOG_KEY'];

        const { analytics } = await import('./index');
        expect(mockNullAnalyticsAdapterConstructor).toHaveBeenCalledTimes(1);
        expect(mockPostHogAdapterConstructor).not.toHaveBeenCalled();
        expect(analytics).toBe(mockNullAdapterInstance);
    });

    it('should initialize NullAnalyticsAdapter when provider is "posthog" but key is missing', async () => {
        (import.meta.env as any)['VITE_ANALYTICS_PROVIDER'] = 'posthog';
        delete (import.meta.env as any)['VITE_POSTHOG_KEY'];

        const { analytics } = await import('./index');
        expect(mockNullAnalyticsAdapterConstructor).toHaveBeenCalledTimes(1);
        expect(mockPostHogAdapterConstructor).not.toHaveBeenCalled();
        expect(analytics).toBe(mockNullAdapterInstance);
    });

     it('should initialize NullAnalyticsAdapter when provider is unsupported', async () => {
        (import.meta.env as any)['VITE_ANALYTICS_PROVIDER'] = 'mixpanel';
        (import.meta.env as any)['VITE_POSTHOG_KEY'] = posthogKey;

        const { analytics } = await import('./index');
        expect(mockNullAnalyticsAdapterConstructor).toHaveBeenCalledTimes(1);
        expect(mockPostHogAdapterConstructor).not.toHaveBeenCalled();
        expect(analytics).toBe(mockNullAdapterInstance);
    });

    // --- PostHog Adapter Tests (Phase 2) ---
    it('should initialize PostHogAdapter when provider is "posthog" and key is present', async () => {
        (import.meta.env as any)['VITE_ANALYTICS_PROVIDER'] = 'posthog';
        (import.meta.env as any)['VITE_POSTHOG_KEY'] = posthogKey;
        (import.meta.env as any)['VITE_POSTHOG_HOST'] = posthogHost;

        const { analytics } = await import('./index');

        // Check constructor calls
        expect(mockPostHogAdapterConstructor).toHaveBeenCalledTimes(1);
        expect(mockNullAnalyticsAdapterConstructor).not.toHaveBeenCalled();

        // Check init was called on the PostHog instance
        expect(mockPosthogAdapterInstance.init).toHaveBeenCalledTimes(1);
        expect(mockPosthogAdapterInstance.init).toHaveBeenCalledWith(posthogKey, posthogHost);

        // Check exported instance type
        expect(analytics).toBe(mockPosthogAdapterInstance);
    });

    it('should use default PostHog host if VITE_POSTHOG_HOST is not set', async () => {
        (import.meta.env as any)['VITE_ANALYTICS_PROVIDER'] = 'posthog';
        (import.meta.env as any)['VITE_POSTHOG_KEY'] = posthogKey;
        delete (import.meta.env as any)['VITE_POSTHOG_HOST']; // Ensure it's unset

        await import('./index');

        expect(mockPostHogAdapterConstructor).toHaveBeenCalledTimes(1);
        expect(mockPosthogAdapterInstance.init).toHaveBeenCalledTimes(1);
        // Check that the default host was used
        expect(mockPosthogAdapterInstance.init).toHaveBeenCalledWith(posthogKey, 'https://app.posthog.com');
    });
    
    it('should fall back to NullAnalyticsAdapter if PostHogAdapter init throws', async () => {
        (import.meta.env as any)['VITE_ANALYTICS_PROVIDER'] = 'posthog';
        (import.meta.env as any)['VITE_POSTHOG_KEY'] = posthogKey;
        (import.meta.env as any)['VITE_POSTHOG_HOST'] = posthogHost;
        
        // Make the mocked PostHogAdapter constructor throw an error during init
        const initError = new Error('Initialization failed');
        mockPosthogAdapterInstance.init.mockImplementationOnce(() => {
            throw initError;
        });
        // Use dynamic import to get the mocked logger instance
        const { logger } = await import('@paynless/utils');

        const { analytics } = await import('./index');

        // Check constructors
        expect(mockPostHogAdapterConstructor).toHaveBeenCalledTimes(1); // Attempted to construct
        expect(mockNullAnalyticsAdapterConstructor).toHaveBeenCalledTimes(1); // Fallback constructor
        
        // Check init was attempted
        expect(mockPosthogAdapterInstance.init).toHaveBeenCalledTimes(1);
        expect(mockPosthogAdapterInstance.init).toHaveBeenCalledWith(posthogKey, posthogHost);
        
        // Check logger was called
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to initialize PostHog Adapter'),
            expect.objectContaining({ error: initError.message })
        );

        // Check final exported instance
        expect(analytics).toBe(mockNullAdapterInstance);
    });
}); 