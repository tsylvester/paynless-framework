import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostHogAdapter } from './posthogAdapter';

// Mock the entire posthog-js library
vi.mock('posthog-js', () => {
  // Define the mock object *inside* the factory function
  const mockPosthog = {
    init: vi.fn(),
    identify: vi.fn(),
    capture: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    isFeatureEnabled: vi.fn().mockReturnValue(false),
  };
  return {
    default: mockPosthog,
  };
});

// Mock the logger
vi.mock('@paynless/utils', () => ({
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
}));


describe('PostHogAdapter', () => {
  const apiKey = 'test-api-key';
  const apiHost = 'https://test.posthog.com';
  let adapter: PostHogAdapter;
  let mockPosthog: any; // Variable to hold the mock object

  beforeEach(async () => {
    // Dynamically import the mocked library to get the mock object reference
    mockPosthog = (await import('posthog-js')).default;
    vi.clearAllMocks(); // Clear mocks before each test
    adapter = new PostHogAdapter();
    // Simulate successful initialization for most tests
    mockPosthog.init.mockImplementation((_key: any, config: any) => {
        if (config && config.loaded) {
            config.loaded(mockPosthog); // Simulate the loaded callback
        }
    });
    adapter.init(apiKey, apiHost);
    // Reset mocks again *after* init call in beforeEach to ignore calls during setup
    vi.clearAllMocks();
  });

  it('should instantiate without errors', () => {
    expect(adapter).toBeInstanceOf(PostHogAdapter);
  });

  describe('init', () => {
    let initAdapter: PostHogAdapter;
    beforeEach(() => {
        vi.clearAllMocks();
        initAdapter = new PostHogAdapter();
    });

    it('should call posthog.init with correct parameters and config', () => {
      initAdapter.init(apiKey, apiHost);
      expect(mockPosthog.init).toHaveBeenCalledTimes(1);
      expect(mockPosthog.init).toHaveBeenCalledWith(apiKey, {
        api_host: apiHost,
        autocapture: true,
        session_recording: expect.any(Object), // Check structure if needed
        capture_pageview: true,
        loaded: expect.any(Function),
      });
    });

    it('should set isInitialized flag on successful load within init', async () => {
       // Need to access internal state or test behavior dependent on it
       const { logger } = await import('@paynless/utils'); // <-- Use dynamic import
       // Test behavior: identify should warn before init completes
       initAdapter.identify('user1');
       expect(mockPosthog.identify).not.toHaveBeenCalled();
       expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('identify called before initialization'));
       vi.clearAllMocks(); // Clear warn call

       mockPosthog.init.mockImplementationOnce((_key: any, _config: any) => {
           if (_config?.loaded) {
               _config.loaded(mockPosthog); // Simulate loaded callback
           }
       });
       initAdapter.init(apiKey, apiHost);

       // Test behavior: identify should work after init completes
       initAdapter.identify('user1');
       expect(mockPosthog.identify).toHaveBeenCalledTimes(1);
       expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('identify called before initialization'));
    });

    it('should not call posthog.init again if already initialized', () => {
      adapter.init(apiKey, apiHost); // Already called in outer beforeEach
      vi.clearAllMocks();
      adapter.init(apiKey, apiHost); // Second call
      expect(mockPosthog.init).not.toHaveBeenCalled();
    });

    it('should handle errors during posthog.init', async () => { // Mark test as async
        const initError = new Error('PostHog Init Failed');
        mockPosthog.init.mockImplementationOnce(() => {
            throw initError;
        });
        // Use dynamic import for logger
        const { logger } = await import('@paynless/utils');

        expect(() => initAdapter.init(apiKey, apiHost)).not.toThrow(); // Adapter should catch it
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to initialize PostHog'),
            expect.objectContaining({ error: initError.message })
        );
    });
  });

  describe('identify', () => {
    it('should call posthog.identify with userId and traits', () => {
      const userId = 'user123';
      const traits = { email: 'test@example.com', name: 'Test User' };
      adapter.identify(userId, traits);
      expect(mockPosthog.identify).toHaveBeenCalledTimes(1);
      expect(mockPosthog.identify).toHaveBeenCalledWith(userId, traits);
    });

    it('should call posthog.identify with userId only if no traits', () => {
      const userId = 'user456';
      adapter.identify(userId);
      expect(mockPosthog.identify).toHaveBeenCalledTimes(1);
      expect(mockPosthog.identify).toHaveBeenCalledWith(userId, undefined);
    });

    it('should warn and not call posthog.identify if not initialized', async () => { // Mark test as async
        const uninitializedAdapter = new PostHogAdapter(); // Don't call init
        // Use dynamic import for logger
        const { logger } = await import('@paynless/utils');
        uninitializedAdapter.identify('user1');
        expect(mockPosthog.identify).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('identify called before initialization'));
    });
  });

  describe('track', () => {
    it('should call posthog.capture with eventName and properties', () => {
      const eventName = 'ButtonClicked';
      const properties = { buttonName: 'Submit', page: 'Home' };
      adapter.track(eventName, properties);
      expect(mockPosthog.capture).toHaveBeenCalledTimes(1);
      expect(mockPosthog.capture).toHaveBeenCalledWith(eventName, properties);
    });

    it('should call posthog.capture with eventName only if no properties', () => {
      const eventName = 'PageLoaded';
      adapter.track(eventName);
      expect(mockPosthog.capture).toHaveBeenCalledTimes(1);
      expect(mockPosthog.capture).toHaveBeenCalledWith(eventName, undefined);
    });

    it('should warn and not call posthog.capture if not initialized', async () => { // Mark test as async
        const uninitializedAdapter = new PostHogAdapter();
        // Use dynamic import for logger
        const { logger } = await import('@paynless/utils');
        uninitializedAdapter.track('testEvent');
        expect(mockPosthog.capture).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('track called before initialization'));
    });
  });

  describe('reset', () => {
    it('should call posthog.reset', () => {
      adapter.reset();
      expect(mockPosthog.reset).toHaveBeenCalledTimes(1);
    });

     it('should not call posthog.reset if not initialized', () => {
        const uninitializedAdapter = new PostHogAdapter();
        uninitializedAdapter.reset();
        expect(mockPosthog.reset).not.toHaveBeenCalled();
    });
  });

  describe('Optional Methods', () => {
    it('optInTracking should call posthog.opt_in_capturing', () => {
        adapter.optInTracking?.();
        expect(mockPosthog.opt_in_capturing).toHaveBeenCalledTimes(1);
    });

    it('optOutTracking should call posthog.opt_out_capturing', () => {
        adapter.optOutTracking?.();
        expect(mockPosthog.opt_out_capturing).toHaveBeenCalledTimes(1);
    });

    it('isFeatureEnabled should call posthog.isFeatureEnabled and return result', () => {
        const flagKey = 'beta-feature';
        mockPosthog.isFeatureEnabled.mockReturnValueOnce(true);
        const result = adapter.isFeatureEnabled?.(flagKey);
        expect(mockPosthog.isFeatureEnabled).toHaveBeenCalledTimes(1);
        expect(mockPosthog.isFeatureEnabled).toHaveBeenCalledWith(flagKey);
        expect(result).toBe(true);
    });

    it('isFeatureEnabled should return false if posthog returns falsy', () => {
        const flagKey = 'another-feature';
        mockPosthog.isFeatureEnabled.mockReturnValueOnce(undefined); // Simulate falsy return
        const result = adapter.isFeatureEnabled?.(flagKey);
        expect(result).toBe(false);
    });

    it('optional methods should warn and do nothing/return false if not initialized', async () => { // Mark test as async
        const uninitializedAdapter = new PostHogAdapter();
        // Use dynamic import for logger
        const { logger } = await import('@paynless/utils');

        uninitializedAdapter.optInTracking?.();
        expect(mockPosthog.opt_in_capturing).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('optInTracking called before initialization'));
        vi.clearAllMocks(); // Clear mocks for next check

        // Opt out doesn't warn
        uninitializedAdapter.optOutTracking?.();
        expect(mockPosthog.opt_out_capturing).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('optOutTracking'));
        vi.clearAllMocks();

        const result = uninitializedAdapter.isFeatureEnabled?.('flag');
        expect(result).toBe(false);
        expect(mockPosthog.isFeatureEnabled).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('isFeatureEnabled called before initialization'));
    });
  });
}); 