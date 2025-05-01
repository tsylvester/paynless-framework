// packages/api/src/mocks/mockApiClient.ts
import { vi } from 'vitest';
import type { ApiClient } from '../apiClient'; // Adjust path if needed
// Import Realtime types for more accurate mocking - Corrected import path
import type { RealtimeChannel, RealtimeChannelOptions, REALTIME_SUBSCRIBE_STATES, SupabaseClient } from '@supabase/supabase-js';
// Removed SupabaseClient import from here as it's now above
// import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A reusable mock object for the ApiClient, suitable for Vitest unit tests.
 * Provides vi.fn() implementations for common ApiClient methods.
 */
export const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  getFunctionsUrl: vi.fn().mockReturnValue('http://mock-functions.api/v1'), // Default mock URL
  getSupabaseClient: vi.fn().mockImplementation(() => { // Use mockImplementation for complex return
    // Mock the Supabase client instance
    const mockSupabase = {
      channel: vi.fn().mockImplementation((name: string, opts?: RealtimeChannelOptions) => {
        // Mock the RealtimeChannel instance
        const mockChannel = {
          // Mock methods used by NotificationApiClient
          on: vi.fn(() => mockChannel), // Return self for chaining
          subscribe: vi.fn((callback?: (status: REALTIME_SUBSCRIBE_STATES, err?: Error) => void) => {
            // Optionally simulate async subscription confirmation
            // setTimeout(() => callback?.('SUBSCRIBED', undefined), 0);
            return mockChannel; // Return self for chaining
          }),
          unsubscribe: vi.fn(() => mockChannel), // Return self for chaining
          // Add other necessary RealtimeChannel properties/methods as vi.fn() if needed by tests
          topic: name, // Include necessary properties
          params: {}, // Provide default empty params object
          // ... other properties can be mocked as needed ...
        } as unknown as RealtimeChannel; // Cast to satisfy the type
        return mockChannel;
      }),
      removeChannel: vi.fn(),
      // Add other Supabase client methods here if needed across tests (e.g., auth, storage)
      auth: { // Basic mock for auth if needed elsewhere
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }), 
        // ... other auth methods
      }
    };
    return mockSupabase as unknown as SupabaseClient;
  }),
  // Add any other ApiClient public methods that need mocking
} as unknown as ApiClient; // Use type assertion for the overall object

/**
 * Resets all mock functions on the shared mockApiClient instance.
 * Call this in your test setup (e.g., beforeEach) to ensure clean state.
 */
export const resetMockApiClient = () => {
  vi.mocked(mockApiClient.get).mockReset();
  vi.mocked(mockApiClient.post).mockReset();
  vi.mocked(mockApiClient.put).mockReset();
  vi.mocked(mockApiClient.delete).mockReset();
  vi.mocked(mockApiClient.getFunctionsUrl).mockReset().mockReturnValue('http://mock-functions.api/v1');
  vi.mocked(mockApiClient.getSupabaseClient).mockReset().mockImplementation(() => {
    const mockSupabase = {
      channel: vi.fn().mockImplementation((name: string, opts?: RealtimeChannelOptions) => {
        const mockChannel = {
          on: vi.fn(() => mockChannel),
          subscribe: vi.fn((callback?: (status: REALTIME_SUBSCRIBE_STATES, err?: Error) => void) => mockChannel),
          unsubscribe: vi.fn(() => mockChannel),
          topic: name,
          params: {}, // Provide default empty params object
        } as unknown as RealtimeChannel;
        return mockChannel;
      }),
      removeChannel: vi.fn(),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      }
    };
    return mockSupabase as unknown as SupabaseClient;
  });
}; 