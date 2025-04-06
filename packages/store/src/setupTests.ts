import { vi, beforeEach } from 'vitest';

// Mock the entire api-client module
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

// Mock the StripeApiClient specifically (if stores interact with it directly)
const mockStripeApiClient = {
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    getSubscriptionPlans: vi.fn(),
    getUserSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    resumeSubscription: vi.fn(),
    getUsageMetrics: vi.fn(),
};

vi.mock('@paynless/api-client', () => ({
  api: mockApi,
  initializeApiClient: vi.fn(), // Mock initialization if needed by tests
  ApiError: class MockApiError extends Error { // Mock the custom error class
      code?: string | number;
      status?: number;
      constructor(message: string) {
          super(message);
          this.name = 'MockApiError';
      }
  },
  // Mock StripeApiClient if stores import it directly
  StripeApiClient: vi.fn(() => mockStripeApiClient)
  // We likely DON'T need to mock FetchOptions here
}));

// Optional: Mock the logger from @paynless/utils if stores use it heavily
// vi.mock('@paynless/utils', () => ({
//   logger: {
//     debug: vi.fn(),
//     info: vi.fn(),
//     warn: vi.fn(),
//     error: vi.fn(),
//     configure: vi.fn(), 
//     getInstance: vi.fn().mockReturnThis()
//   }
// }));

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  // Reset specific mocks to default implementations if needed
  // e.g., mockApi.get.mockResolvedValue({ data: null });
  
  // Remove Deno.env mock - subscriptionStore doesn't use it for initial state
  /*
  vi.stubGlobal('Deno', {
      env: {
          get: (key: string) => {
              if (key === 'STRIPE_TEST_MODE') {
                  return 'true'; // Mock as true for tests
              }
              // Allow other env vars to be potentially undefined or mocked elsewhere
              return undefined; 
          },
          // Add other Deno.env methods if needed by the code under test
      },
      // Add other Deno properties/methods if needed
  });
  */
});

// Export mocks for potential use in test files
export { mockApi, mockStripeApiClient }; 