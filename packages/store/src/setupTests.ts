import { vi, beforeEach } from 'vitest';

// Import mock functions from centralized factories in @paynless/utils
import {
  mockStripeCreateCheckoutSession,
  mockStripeCreatePortalSession,
  mockStripeGetSubscriptionPlans,
  mockStripeGetUserSubscription,
  mockStripeCancelSubscription,
  mockStripeResumeSubscription,
  mockStripeGetUsageMetrics,
  resetStripeMocks
} from './mocks/stripe.mock';
import {
  mockAnalyticsTrack,
  mockAnalyticsIdentify,
  mockAnalyticsReset,
  resetAnalyticsMocks
} from '@paynless/utils/src/mocks/analytics.mock';
import {
  mockLoggerDebug,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
  mockLoggerConfigure,
  resetLoggerMocks
} from '@paynless/utils/src/mocks/logger.mock';

// --- Global Mocks Applied Here --- 

// REMOVE GLOBAL MOCK for @paynless/api-client
// vi.mock('@paynless/api-client', async () => {
//   // Import the actual mock functions INSIDE the factory
//   const stripeMocks = await import('./mocks/stripe.mock');
//   // Return ONLY the mocked structure needed by store tests
//   return {
//     // Provide the 'api' object structure
//     api: {
//       // Mock the billing accessor function
//       billing: vi.fn(() => ({ 
//         createCheckoutSession: stripeMocks.mockStripeCreateCheckoutSession,
//         createPortalSession: stripeMocks.mockStripeCreatePortalSession,
//         getSubscriptionPlans: stripeMocks.mockStripeGetSubscriptionPlans,
//         getUserSubscription: stripeMocks.mockStripeGetUserSubscription,
//         cancelSubscription: stripeMocks.mockStripeCancelSubscription,
//         resumeSubscription: stripeMocks.mockStripeResumeSubscription,
//         getUsageMetrics: stripeMocks.mockStripeGetUsageMetrics,
//       })),
//       // Add other api parts if needed by other stores (e.g., ai)
//        ai: vi.fn(() => ({ /* mock relevant ai methods */ })),
//        // Add general methods if directly used by stores
//        get: vi.fn(),
//        post: vi.fn(),
//        put: vi.fn(),
//        delete: vi.fn(),
//     },
//     // Provide other necessary exports (even if just mocks)
//     initializeApiClient: vi.fn(), 
//     ApiError: class MockApiError extends Error { 
//         code?: string | number;
//         status?: number;
//         constructor(message: string) { super(message); this.name = 'MockApiError'; }
//     },
//     // IMPORTANT: DO NOT include _resetApiClient here if it's meant to be the real one
//   };
// });

// Mock the analytics client module
vi.mock('@paynless/analytics-client', async () => {
  // Import the actual mock functions INSIDE the factory
  const analyticsMocks = await import('@paynless/utils/src/mocks/analytics.mock');
  return {
    analytics: {
      track: analyticsMocks.mockAnalyticsTrack,
      identify: analyticsMocks.mockAnalyticsIdentify,
      reset: analyticsMocks.mockAnalyticsReset,
    },
  };
});

// Mock the logger module
vi.mock('@paynless/utils', async () => {
  // Import the actual mock functions INSIDE the factory
  const loggerMocks = await import('@paynless/utils/src/mocks/logger.mock');
  // If @paynless/utils exports other things besides logger, import the original
  // const actualUtils = await importOriginal<typeof import('@paynless/utils')>();
  return {
    // ...actualUtils, // Spread other exports if needed
    logger: {
      debug: loggerMocks.mockLoggerDebug,
      info: loggerMocks.mockLoggerInfo,
      warn: loggerMocks.mockLoggerWarn,
      error: loggerMocks.mockLoggerError,
      configure: loggerMocks.mockLoggerConfigure,
    }
  };
});

// --- Global beforeEach --- 

// Reset mocks before each test
beforeEach(() => {
  // Use the reset helpers from the factories
  resetStripeMocks();
  resetAnalyticsMocks();
  resetLoggerMocks();
  
  // Re-apply default mocks needed by tests (using imported mocks)
  mockStripeGetSubscriptionPlans.mockResolvedValue({
    status: 200,
    data: [], // Default to empty plans array
    error: undefined
  });
  mockStripeGetUserSubscription.mockResolvedValue({
    status: 200,
    data: null, // Default to no existing subscription
    error: undefined
  });
});

// No need to export local mocks anymore
// export { mockApi, mockStripeApiClient }; 