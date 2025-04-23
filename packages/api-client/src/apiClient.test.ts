import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthRequiredError } from '@paynless/types';

import { api, initializeApiClient, _resetApiClient, ApiError, getApiClient } from './apiClient';
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

describe('apiClient', () => {
  let internalApiClientInstance: ApiClient;
  let mockSupabaseClient: ReturnType<typeof createClient>; // Type for the mock
  const MOCK_FUNCTIONS_URL = `${MOCK_SUPABASE_URL}/functions/v1`;

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test
    _resetApiClient();

    // Initialize. This will call the mocked createClient internally.
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });

    // Get the instance using the exported (for test) function
    internalApiClientInstance = getApiClient();

    // Get the reference to the mock client returned by the mocked createClient
    // This relies on the vi.mock structure above
    mockSupabaseClient = (createClient as any).mock.results[0].value;

    // ---> Configure mock directly here <--- 
    (mockSupabaseClient.auth.getSession as vi.Mock).mockResolvedValue({
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
    });
  });

  afterEach(() => {
    _resetApiClient();
    server.resetHandlers();
    // No need for vi.restoreAllMocks() if using vi.clearAllMocks() in beforeEach
  });

  describe('initializeApiClient', () => {
    it('should initialize the Supabase client using createClient', () => {
      expect(createClient).toHaveBeenCalledTimes(1);
      expect(createClient).toHaveBeenCalledWith(MOCK_SUPABASE_URL, MOCK_ANON_KEY);
    });

    it('should throw error if called more than once', () => {
      // Already initialized in beforeEach
      expect(() => initializeApiClient({ supabaseUrl: 'another-url', supabaseAnonKey: 'key' }))
        .toThrow('ApiClient already initialized');
    });

    it('should throw error if config is missing', () => {
      _resetApiClient(); // Reset first
      expect(() => initializeApiClient({} as any))
        .toThrow('Supabase URL and Anon Key are required');
    });
  });

  // ---> NEW Test Suite for the Getter <--- 
  describe('api.getSupabaseClient', () => {
    it('should return the underlying Supabase client instance', () => {
      const retrievedClient = api.getSupabaseClient();
      // Assert that the retrieved client is the exact same mock instance
      expect(retrievedClient).toBe(mockSupabaseClient);
    });

    it('should throw an error if called before initialization', () => {
      _resetApiClient(); // Ensure it's not initialized
      expect(() => api.getSupabaseClient()).toThrow('ApiClient not initialized');
    });
  });
  // ---> End NEW Test Suite <---

  describe('api.get', () => {
    it('should perform a GET request to the correct endpoint', async () => {
      const endpoint = 'test-get';
      const mockData = { message: 'Success' };
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => HttpResponse.json(mockData))
      );
      const response = await api.get(endpoint);
      expect(response.error).toBeUndefined();
      expect(response.data).toEqual(mockData);
      expect(response.status).toBe(200);
    });

    it('should include Authorization header when session exists', async () => {
      const endpoint = 'test-auth-get';
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, async ({ request }) => {
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          // Also check for apikey header
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          return HttpResponse.json({});
        })
      );
      await api.get(endpoint);
    });
    
    it('should NOT include Authorization header for public requests even if session exists', async () => {
      const endpoint = 'test-public-get';
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, async ({ request }) => {
          expect(request.headers.get('Authorization')).toBeNull();
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY); // apikey still present
          return HttpResponse.json({});
        })
      );
       // Call public endpoint, should ignore mocked session
      await api.get(endpoint, { isPublic: true });
    });

    it('should return ApiResponse with network error object on network error', async () => {
      const endpoint = 'test-network-error';
      // Use HttpResponse.error() to simulate network failure
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => HttpResponse.error())
      );
      const response = await api.get(endpoint);
      expect(response.data).toBeUndefined();
      expect(response.status).toBe(0);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('NETWORK_ERROR');
      expect(response.error?.message).toMatch(/Network error|Failed to fetch/); // Allow fetch specific message
    });

    it('should return ApiResponse with API error object on 400 API error response', async () => {
      const endpoint = 'test-api-error-400';
      const errorResponse = { message: 'Invalid request', code: 'INVALID_INPUT' };
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => 
          HttpResponse.json(errorResponse, { status: 400 })
        )
      );
      const response = await api.get(endpoint);
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
      const response = await api.get(endpoint);
      expect(response.data).toBeUndefined();
      expect(response.status).toBe(500);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('500'); // Status code as string
      expect(response.error?.message).toBe(errorText); // Extracts text correctly
    });
    
    // --- NEW Test for AuthRequiredError ---
    it('should THROW AuthRequiredError and store pending action on 401 with code AUTH_REQUIRED', async () => {
        const endpoint = 'test-auth-required';
        const errorResponse = { message: 'Please log in', code: 'AUTH_REQUIRED' };
        server.use(
            http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => 
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
        // Mock window.location for returnPath
        const originalLocation = window.location;
        delete window.location;
        window.location = { ...originalLocation, pathname: '/protected/resource', search: '?a=1' } as Location;
        const expectedReturnPath = '/protected/resource?a=1';

        // Use expect().rejects to catch the thrown error
        await expect(api.get(endpoint)).rejects.toThrow(new AuthRequiredError(errorResponse.message));

        // Verify localStorage call
        expect(setItemSpy).toHaveBeenCalledTimes(1);
        expect(setItemSpy).toHaveBeenCalledWith('pendingAction', expect.any(String));
        const storedAction = JSON.parse(setItemSpy.mock.calls[0][1]);
        expect(storedAction).toEqual({
            endpoint: endpoint,
            method: 'GET',
            body: null, // No body for GET
            returnPath: expectedReturnPath
        });

        // Restore mocks
        setItemSpy.mockRestore();
        window.location = originalLocation;
    });
    // --- End NEW Test ---

    it('should return ApiResponse with standard error for 401 WITHOUT code AUTH_REQUIRED', async () => {
        const endpoint = 'test-standard-401';
        const errorResponse = { message: 'Invalid token' }; // No code: AUTH_REQUIRED
        server.use(
            http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => 
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        const response = await api.get(endpoint);
        expect(response.data).toBeUndefined();
        expect(response.status).toBe(401);
        expect(response.error).toBeDefined();
        expect(response.error?.code).toBe('401'); // Just status code
        expect(response.error?.message).toBe(errorResponse.message);
        // IMPORTANT: Should NOT throw AuthRequiredError
    });

  });

  // ---> Add tests for POST <--- 
  describe('api.post', () => {
    const endpoint = 'test-post';
    const requestBody = { name: 'test', value: 123 };
    const mockResponseData = { id: 'new-resource', ...requestBody };

    it('should perform a POST request with correct body and headers', async () => {
      server.use(
        http.post(`${MOCK_FUNCTIONS_URL}/${endpoint}`, async ({ request }) => {
          expect(request.method).toBe('POST');
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          expect(request.headers.get('Content-Type')).toBe('application/json');
          expect(await request.json()).toEqual(requestBody); // Verify body
          return HttpResponse.json(mockResponseData, { status: 201 });
        })
      );
      const response = await api.post(endpoint, requestBody);
      expect(response.error).toBeUndefined();
      expect(response.data).toEqual(mockResponseData);
      expect(response.status).toBe(201);
    });

    it('should handle API errors for POST requests', async () => {
       const errorResponse = { message: 'Creation failed', code: 'POST_ERROR' };
       server.use(
         http.post(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => 
           HttpResponse.json(errorResponse, { status: 400 })
         )
       );
       const response = await api.post(endpoint, requestBody);
       expect(response.data).toBeUndefined();
       expect(response.status).toBe(400);
       expect(response.error).toEqual(errorResponse);
    });
  });

  // ---> Add tests for PUT <--- 
  describe('api.put', () => {
    const endpoint = 'test-put/resource-id';
    const requestBody = { name: 'updated name' };
    const mockResponseData = { id: 'resource-id', name: 'updated name' };

    it('should perform a PUT request with correct body and headers', async () => {
      server.use(
        http.put(`${MOCK_FUNCTIONS_URL}/${endpoint}`, async ({ request }) => {
          expect(request.method).toBe('PUT');
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          expect(request.headers.get('Content-Type')).toBe('application/json');
          expect(await request.json()).toEqual(requestBody);
          return HttpResponse.json(mockResponseData);
        })
      );
      const response = await api.put(endpoint, requestBody);
      expect(response.error).toBeUndefined();
      expect(response.data).toEqual(mockResponseData);
      expect(response.status).toBe(200);
    });

    it('should handle API errors for PUT requests', async () => {
       const errorResponse = { message: 'Update failed', code: 'PUT_ERROR' };
       server.use(
         http.put(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => 
           HttpResponse.json(errorResponse, { status: 500 })
         )
       );
       const response = await api.put(endpoint, requestBody);
       expect(response.data).toBeUndefined();
       expect(response.status).toBe(500);
       // Need to adjust expected error shape based on refined logic
       expect(response.error?.code).toBe(errorResponse.code);
       expect(response.error?.message).toBe(errorResponse.message);
    });
  });

  // ---> Add tests for DELETE <--- 
  describe('api.delete', () => {
    const endpoint = 'test-delete/resource-id';

    it('should perform a DELETE request with correct headers', async () => {
      server.use(
        http.delete(`${MOCK_FUNCTIONS_URL}/${endpoint}`, ({ request }) => {
          expect(request.method).toBe('DELETE');
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          // No body for DELETE usually
          return new HttpResponse(null, { status: 204 }); // No Content
        })
      );
      const response = await api.delete(endpoint);
      expect(response.error).toBeUndefined();
      expect(response.data).toBe(''); // <-- Expect empty string for 204
      expect(response.status).toBe(204);
    });

    it('should handle API errors for DELETE requests', async () => {
      const errorResponse = { message: 'Deletion forbidden', code: 'FORBIDDEN' };
      server.use(
        http.delete(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => 
          HttpResponse.json(errorResponse, { status: 403 })
        )
      );
      const response = await api.delete(endpoint);
      expect(response.data).toBeUndefined();
      expect(response.status).toBe(403);
      expect(response.error).toEqual(errorResponse);
    });
  });

}); 