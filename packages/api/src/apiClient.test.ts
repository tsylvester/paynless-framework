import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthRequiredError } from '@paynless/types';

// Import the ApiClient class directly
import { ApiClient, ApiError } from './apiClient';
import { server } from './setupTests'; // <-- Import the shared server
// Remove direct SupabaseClient import if no longer needed here
// import { SupabaseClient } from '@supabase/supabase-js'; // Import SupabaseClient type
// Import the mock utility
// import { mockSupabaseAuthSession, MOCK_ACCESS_TOKEN } from './mocks/supabase.mock';

// Mock the @supabase/supabase-js module
vi.mock('@supabase/supabase-js', () => {
  // Create a *persistent* mock client instance across tests in this file
  const mockClient = {
    auth: {
      getSession: vi.fn(),
      // Add other methods if needed by other parts of apiClient
    },
    channel: vi.fn(() => ({ // Basic channel mock if needed
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
    // Add other Supabase client properties/methods if apiClient uses them
  };
  return {
    createClient: vi.fn(() => mockClient), // createClient returns the mockClient
    SupabaseClient: vi.fn(), // Mock the class type itself if needed
  };
});

// Mock the base URL and key
const MOCK_SUPABASE_URL = 'http://mock-supabase.co';
const MOCK_ANON_KEY = 'mock-anon-key';
// Use MOCK_ACCESS_TOKEN from the utility file
// const MOCK_ACCESS_TOKEN = 'mock-test-access-token';

// ---> Use a local constant for token in tests <--- 
const MOCK_ACCESS_TOKEN = 'mock-test-access-token-local';

describe('ApiClient', () => { // Changed describe name to reflect class testing
  let apiClientInstance: ApiClient; // Use the actual ApiClient class type
  let mockSupabaseClient: ReturnType<typeof createClient>; // Type for the mock client
  const MOCK_FUNCTIONS_URL = `${MOCK_SUPABASE_URL}/functions/v1`;

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test
    // Remove _resetApiClient() and initializeApiClient()

    // Get the reference to the mock client created by the vi.mock
    // Note: Directly using the mocked createClient function here might be fragile.
    // It's often better to create the mock client explicitly in beforeEach.
    // Let's recreate the mock client explicitly here for clarity and robustness.
    const mockAuth = {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: MOCK_ACCESS_TOKEN,
            refresh_token: 'mock-refresh-token',
            user: { id: 'mock-user-id' } as any,
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Date.now() / 1000 + 3600,
          }
        },
        error: null
      }),
    };
    mockSupabaseClient = { // Assign to the outer scope variable
      auth: mockAuth,
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      })),
      removeChannel: vi.fn(),
    } as unknown as ReturnType<typeof createClient>; // Use type assertion

    // Instantiate ApiClient directly, passing the mock client and config
    apiClientInstance = new ApiClient({
      supabase: mockSupabaseClient,
      supabaseUrl: MOCK_SUPABASE_URL,
      supabaseAnonKey: MOCK_ANON_KEY,
    });

  });

  afterEach(() => {
    // Remove _resetApiClient()
    server.resetHandlers();
    // No need for vi.restoreAllMocks() if using vi.clearAllMocks() in beforeEach
  });

  describe('getSupabaseClient', () => {
    it('should return the underlying Supabase client instance passed during construction', () => {
      const retrievedClient = apiClientInstance.getSupabaseClient();
      // Assert that the retrieved client is the exact same mock instance passed in
      expect(retrievedClient).toBe(mockSupabaseClient);
    });

    // This test might no longer be relevant as you can always create an instance
    // it('should throw an error if called before initialization', () => { ... });
  });

  describe('get', () => { // Renamed 'api.get' to 'get'
    it('should perform a GET request to the correct endpoint', async () => {
      const endpoint = 'test-get';
      const mockData = { message: 'Success' };
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => HttpResponse.json(mockData))
      );
      // Use the local apiClientInstance
      const response = await apiClientInstance.get(endpoint);
      expect(response.error).toBeUndefined();
      expect(response.data).toEqual(mockData);
      expect(response.status).toBe(200);
    });

    it('should include Authorization header when session exists', async () => {
      const endpoint = 'test-auth-get';
      // Configure the mock getSession for this specific test case if needed,
      // although the beforeEach setup should cover the default case.
      (mockSupabaseClient.auth.getSession as vi.Mock).mockResolvedValueOnce({
        data: { session: { access_token: MOCK_ACCESS_TOKEN } }, error: null
      });

      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, async ({ request }) => {
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          return HttpResponse.json({});
        })
      );
      // Use the local apiClientInstance
      await apiClientInstance.get(endpoint);
    });

    it('should NOT include Authorization header for public requests even if session exists', async () => {
      const endpoint = 'test-public-get';
      // Session is mocked in beforeEach, but isPublic should override it
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, async ({ request }) => {
          expect(request.headers.get('Authorization')).toBeNull();
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY); // apikey still present
          return HttpResponse.json({});
        })
      );
      // Use the local apiClientInstance
      await apiClientInstance.get(endpoint, { isPublic: true });
    });

    it('should return ApiResponse with network error object on network error', async () => {
      const endpoint = 'test-network-error';
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => HttpResponse.error())
      );
      // Use the local apiClientInstance
      const response = await apiClientInstance.get(endpoint);
      expect(response.data).toBeUndefined();
      expect(response.status).toBe(0);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('NETWORK_ERROR');
      expect(response.error?.message).toMatch(/Network error|Failed to fetch/);
    });

    it('should return ApiResponse with API error object on 400 API error response', async () => {
      const endpoint = 'test-api-error-400';
      const errorResponse = { message: 'Invalid request', code: 'INVALID_INPUT' };
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
          HttpResponse.json(errorResponse, { status: 400 })
        )
      );
      // Use the local apiClientInstance
      const response = await apiClientInstance.get(endpoint);
      expect(response.data).toBeUndefined();
      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(errorResponse.code);
      expect(response.error?.message).toBe(errorResponse.message);
    });

    it('should return ApiResponse with API error object on 500 API error response (non-JSON)', async () => {
      const endpoint = 'test-api-error-500-text';
      const errorText = 'Internal Server Error';
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
          new HttpResponse(errorText, { status: 500, headers: { 'Content-Type': 'text/plain' } })
        )
      );
      // Use the local apiClientInstance
      const response = await apiClientInstance.get(endpoint);
      expect(response.data).toBeUndefined();
      expect(response.status).toBe(500);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('500');
      expect(response.error?.message).toBe(errorText);
    });

    it('should THROW AuthRequiredError on GET 401 with code AUTH_REQUIRED', async () => {
        const endpoint = 'test-auth-required';
        const errorResponse = { message: 'Please log in', code: 'AUTH_REQUIRED' };
        server.use(
            http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        // Use the local apiClientInstance and assert throw
        await expect(apiClientInstance.get(endpoint)).rejects.toThrow(new AuthRequiredError(errorResponse.message));
    });

    it('should return ApiResponse with standard error for 401 WITHOUT code AUTH_REQUIRED', async () => {
        const endpoint = 'test-standard-401';
        const errorResponse = { message: 'Invalid token' }; // No code: AUTH_REQUIRED
        server.use(
            http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        // Use the local apiClientInstance
        const response = await apiClientInstance.get(endpoint);
        expect(response.data).toBeUndefined();
        expect(response.status).toBe(401);
        expect(response.error).toBeDefined();
        expect(response.error?.code).toBe('401');
        expect(response.error?.message).toBe(errorResponse.message);
    });

  });

  describe('post', () => { // Renamed 'api.post' to 'post'
    const endpoint = 'test-post';
    const requestBody = { name: 'Test', value: 123 };
    const mockResponseData = { id: 'new-item-123', ...requestBody };

    it('should perform a POST request with correct body and headers', async () => {
      server.use(
        http.post(`${MOCK_FUNCTIONS_URL}/${endpoint}`, async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual(requestBody);
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          expect(request.headers.get('Content-Type')).toBe('application/json');
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          return HttpResponse.json(mockResponseData, { status: 201 });
        })
      );

      // Use the local apiClientInstance
      const response = await apiClientInstance.post(endpoint, requestBody);

      expect(response.error).toBeUndefined();
      expect(response.data).toEqual(mockResponseData);
      expect(response.status).toBe(201);
    });

    it('should handle POST API error response', async () => {
      const errorResponse = { message: 'Creation failed', code: 'FAILED_POST' };
      server.use(
        http.post(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
          HttpResponse.json(errorResponse, { status: 400 })
        )
      );

      // Use the local apiClientInstance
      const response = await apiClientInstance.post(endpoint, requestBody);

      expect(response.data).toBeUndefined();
      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(errorResponse.code);
      expect(response.error?.message).toBe(errorResponse.message);
    });

    it('should THROW AuthRequiredError on POST 401 AUTH_REQUIRED', async () => {
        const errorResponse = { message: 'Login required', code: 'AUTH_REQUIRED' };
        server.use(
            http.post(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        // Use the local apiClientInstance and assert throw
        await expect(apiClientInstance.post(endpoint, requestBody)).rejects.toThrow(AuthRequiredError);
    });
  });

  describe('put', () => { // Renamed 'api.put' to 'put'
    const endpoint = 'test-put/item-123';
    const requestBody = { value: 456 };
    const mockResponseData = { id: 'item-123', value: 456 };

    it('should perform a PUT request with correct body and headers', async () => {
      server.use(
        http.put(`${MOCK_FUNCTIONS_URL}/${endpoint}`, async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual(requestBody);
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          expect(request.headers.get('Content-Type')).toBe('application/json');
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          return HttpResponse.json(mockResponseData, { status: 200 });
        })
      );

      // Use the local apiClientInstance
      const response = await apiClientInstance.put(endpoint, requestBody);

      expect(response.error).toBeUndefined();
      expect(response.data).toEqual(mockResponseData);
      expect(response.status).toBe(200);
    });

    it('should handle PUT API error response', async () => {
      const errorResponse = { message: 'Update failed', code: 'FAILED_PUT' };
      server.use(
        http.put(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
          HttpResponse.json(errorResponse, { status: 500 })
        )
      );

      // Use the local apiClientInstance
      const response = await apiClientInstance.put(endpoint, requestBody);

      expect(response.data).toBeUndefined();
      expect(response.status).toBe(500);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(errorResponse.code);
      expect(response.error?.message).toBe(errorResponse.message);
    });

    it('should THROW AuthRequiredError on PUT 401 AUTH_REQUIRED', async () => {
        const errorResponse = { message: 'Login required', code: 'AUTH_REQUIRED' };
        server.use(
            http.put(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        // Use the local apiClientInstance and assert throw
        await expect(apiClientInstance.put(endpoint, requestBody)).rejects.toThrow(AuthRequiredError);
    });
  });

  describe('delete', () => { // Renamed 'api.delete' to 'delete'
    const endpoint = 'test-delete/item-456';
    const mockResponseData = { message: 'Item deleted successfully' };

    it('should perform a DELETE request with correct headers', async () => {
      server.use(
        http.delete(`${MOCK_FUNCTIONS_URL}/${endpoint}`, ({ request }) => {
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          return HttpResponse.json(mockResponseData, { status: 200 });
        })
      );

      // Use the local apiClientInstance
      const response = await apiClientInstance.delete(endpoint);

      expect(response.error).toBeUndefined();
      expect(response.data).toEqual(mockResponseData);
      expect(response.status).toBe(200);
    });

    it('should handle DELETE request with 204 No Content response', async () => {
      const endpoint = 'test-delete-no-content';
      server.use(
        http.delete(`${MOCK_FUNCTIONS_URL}/${endpoint}`, ({ request }) => {
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          return new HttpResponse(null, { status: 204 }); // No body
        })
      );

      // Use the local apiClientInstance
      const response = await apiClientInstance.delete(endpoint);

      expect(response.error).toBeUndefined();
      expect(response.status).toBe(204);
      // Data should be empty string based on current ApiClient implementation for non-JSON response
      expect(response.data).toBe('');
    });


    it('should handle DELETE API error response', async () => {
      const errorResponse = { message: 'Deletion failed', code: 'FAILED_DELETE' };
      server.use(
        http.delete(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
          HttpResponse.json(errorResponse, { status: 403 }) // Forbidden
        )
      );

      // Use the local apiClientInstance
      const response = await apiClientInstance.delete(endpoint);

      expect(response.data).toBeUndefined();
      expect(response.status).toBe(403);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(errorResponse.code);
      expect(response.error?.message).toBe(errorResponse.message);
    });

    it('should THROW AuthRequiredError on DELETE 401 AUTH_REQUIRED', async () => {
        const errorResponse = { message: 'Login required', code: 'AUTH_REQUIRED' };
        server.use(
            http.delete(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        // Use the local apiClientInstance and assert throw
        await expect(apiClientInstance.delete(endpoint)).rejects.toThrow(AuthRequiredError);
    });
  });

  // +++ NEW TEST SUITE for Realtime Notifications +++
  describe('Realtime Notifications', () => {
    const userId = 'test-user-rt-123';
    const channelName = `notifications-user-${userId}`;
    let mockChannel: any; // To hold the mock channel object
    let notificationCallback: vi.Mock;

    beforeEach(() => {
      // Reset mocks specifically for channel methods for clarity
      vi.clearAllMocks(); 

      // Re-setup the main client instance (needed because clearAllMocks clears the supabase client mock)
      const mockAuth = {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: MOCK_ACCESS_TOKEN } }, error: null
        }),
      };
      // Create specific mocks for channel methods
      mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn((callback) => {
            // Simulate successful subscription immediately
            if (typeof callback === 'function') {
                callback('SUBSCRIBED', null);
            }
            return mockChannel; // Return self for chaining
        }),
        unsubscribe: vi.fn().mockResolvedValue('ok'),
      };
      mockSupabaseClient = { 
        auth: mockAuth,
        channel: vi.fn(() => mockChannel), // Ensure channel() returns our mockChannel
        removeChannel: vi.fn().mockResolvedValue('ok'),
      } as unknown as ReturnType<typeof createClient>; 
  
      apiClientInstance = new ApiClient({
        supabase: mockSupabaseClient,
        supabaseUrl: MOCK_SUPABASE_URL,
        supabaseAnonKey: MOCK_ANON_KEY,
      });

      notificationCallback = vi.fn(); // Reset notification callback mock
    });

    it('subscribeToNotifications should call supabase.channel, on, and subscribe', () => {
      apiClientInstance.subscribeToNotifications(userId, notificationCallback);

      expect(mockSupabaseClient.channel).toHaveBeenCalledTimes(1);
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(channelName, expect.any(Object)); // Basic check for config object

      expect(mockChannel.on).toHaveBeenCalledTimes(1);
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        }),
        expect.any(Function) // The internal handler function
      );

      expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);
      expect(mockChannel.subscribe).toHaveBeenCalledWith(expect.any(Function)); // The status callback
    });

    it('subscribeToNotifications should invoke the callback when a message is received', () => {
      apiClientInstance.subscribeToNotifications(userId, notificationCallback);

      // Find the internal handler function passed to mockChannel.on
      const internalHandler = mockChannel.on.mock.calls[0][2];
      expect(internalHandler).toBeInstanceOf(Function);

      // Simulate receiving a valid payload
      const mockPayload = {
        new: { id: 'notif-1', user_id: userId, message: 'Test notification' },
        // other payload properties...
      };
      internalHandler(mockPayload);

      expect(notificationCallback).toHaveBeenCalledTimes(1);
      expect(notificationCallback).toHaveBeenCalledWith(mockPayload.new);
    });
    
    it('subscribeToNotifications should not invoke callback for payload missing id', () => {
      apiClientInstance.subscribeToNotifications(userId, notificationCallback);
      const internalHandler = mockChannel.on.mock.calls[0][2];
      const mockPayload = { new: { user_id: userId, message: 'Test notification' } }; // Missing id
      internalHandler(mockPayload);
      expect(notificationCallback).not.toHaveBeenCalled();
    });

    it('subscribeToNotifications should handle missing userId', () => {
      apiClientInstance.subscribeToNotifications('', notificationCallback);
      expect(mockSupabaseClient.channel).not.toHaveBeenCalled();
    });

    it('subscribeToNotifications should not subscribe if already subscribed', () => {
      apiClientInstance.subscribeToNotifications(userId, notificationCallback);
      expect(mockSupabaseClient.channel).toHaveBeenCalledTimes(1);
      apiClientInstance.subscribeToNotifications(userId, vi.fn()); // Try subscribing again
      expect(mockSupabaseClient.channel).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('unsubscribeFromNotifications should call channel.unsubscribe and supabase.removeChannel', async () => {
      // First, subscribe to have a channel to unsubscribe from
      apiClientInstance.subscribeToNotifications(userId, notificationCallback);
      expect(mockSupabaseClient.channel).toHaveBeenCalledTimes(1);
      
      // Now unsubscribe
      await apiClientInstance.unsubscribeFromNotifications(userId);

      expect(mockChannel.unsubscribe).toHaveBeenCalledTimes(1);
      expect(mockSupabaseClient.removeChannel).toHaveBeenCalledTimes(1);
      expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(mockChannel);
    });

    it('unsubscribeFromNotifications should handle missing userId', async () => {
       await apiClientInstance.unsubscribeFromNotifications('');
       expect(mockChannel.unsubscribe).not.toHaveBeenCalled();
       expect(mockSupabaseClient.removeChannel).not.toHaveBeenCalled();
    });

    it('unsubscribeFromNotifications should handle unsubscribing when not subscribed', async () => {
      await apiClientInstance.unsubscribeFromNotifications('some-other-user', );
       expect(mockChannel.unsubscribe).not.toHaveBeenCalled();
       expect(mockSupabaseClient.removeChannel).not.toHaveBeenCalled();
    });
    
    it('unsubscribeFromNotifications should handle errors during unsubscribe/removeChannel', async () => {
       apiClientInstance.subscribeToNotifications(userId, notificationCallback);
       const unsubscribeError = new Error('Unsubscribe failed');
       const removeChannelError = new Error('Remove channel failed');
       // Simulate unsubscribe rejecting
       mockChannel.unsubscribe.mockRejectedValueOnce(unsubscribeError);
       (mockSupabaseClient.removeChannel as vi.Mock).mockRejectedValueOnce(removeChannelError);

       // Expect the promise returned by unsubscribeFromNotifications to REJECT because we re-throw the error
       await expect(apiClientInstance.unsubscribeFromNotifications(userId)).rejects.toThrow(unsubscribeError); 

       expect(mockChannel.unsubscribe).toHaveBeenCalledTimes(1);
       // removeChannel should still be called in the finally block
       expect(mockSupabaseClient.removeChannel).toHaveBeenCalledTimes(1);
    });

  });
  // +++ END TEST SUITE for Realtime Notifications +++

}); // End describe('ApiClient') 