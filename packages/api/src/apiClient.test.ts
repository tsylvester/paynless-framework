import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthRequiredError } from '@paynless/types';

import { api, initializeApiClient, _resetApiClient, ApiError } from './apiClient';
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
    it('should THROW AuthRequiredError on GET 401 with code AUTH_REQUIRED', async () => {
        const endpoint = 'test-auth-required';
        const errorResponse = { message: 'Please log in', code: 'AUTH_REQUIRED' };
        server.use(
            http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => 
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        // Assert that the correct error is thrown
        await expect(api.get(endpoint)).rejects.toThrow(new AuthRequiredError(errorResponse.message));
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

  // ---> NEW TESTS for api.post <---
  describe('api.post', () => {
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

      const response = await api.post(endpoint, requestBody);

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

      const response = await api.post(endpoint, requestBody);

      expect(response.data).toBeUndefined();
      expect(response.status).toBe(400);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(errorResponse.code);
      expect(response.error?.message).toBe(errorResponse.message);
    });

     // Test for AuthRequiredError on POST
    it('should THROW AuthRequiredError on POST 401 AUTH_REQUIRED', async () => {
        const errorResponse = { message: 'Login required', code: 'AUTH_REQUIRED' };
        server.use(
            http.post(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        // Assert that the correct error is thrown
        await expect(api.post(endpoint, requestBody)).rejects.toThrow(AuthRequiredError);
    });
  });
  // ---> END NEW TESTS for api.post <---

  // ---> NEW TESTS for api.put <---
  describe('api.put', () => {
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

      const response = await api.put(endpoint, requestBody);

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

      const response = await api.put(endpoint, requestBody);

      expect(response.data).toBeUndefined();
      expect(response.status).toBe(500);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(errorResponse.code); // Uses code from response body
      expect(response.error?.message).toBe(errorResponse.message);
    });

      // Test for AuthRequiredError on PUT
      it('should THROW AuthRequiredError on PUT 401 AUTH_REQUIRED', async () => {
        const errorResponse = { message: 'Login required', code: 'AUTH_REQUIRED' };
        server.use(
            http.put(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        // Assert that the correct error is thrown
        await expect(api.put(endpoint, requestBody)).rejects.toThrow(AuthRequiredError);
    });
  });
  // ---> END NEW TESTS for api.put <---

  // ---> NEW TESTS for api.delete <---
  describe('api.delete', () => {
    const endpoint = 'test-delete/item-456';
    const mockResponseData = { message: 'Item deleted successfully' };

    it('should perform a DELETE request with correct headers', async () => {
      server.use(
        http.delete(`${MOCK_FUNCTIONS_URL}/${endpoint}`, ({ request }) => {
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          // Note: DELETE often returns 200 or 204 with or without a body
          return HttpResponse.json(mockResponseData, { status: 200 });
        })
      );

      const response = await api.delete(endpoint);

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

      const response = await api.delete(endpoint);

      // For 204, data might be null or undefined depending on fetch behavior
      expect(response.error).toBeUndefined();
      expect(response.status).toBe(204);
      // Data might be null if fetch doesn't parse empty response, or T if expected
      // ---> Expect empty string for 204 No Content response based on response.text() fallback <---
      expect(response.data).toBe(''); 
    });


    it('should handle DELETE API error response', async () => {
      const errorResponse = { message: 'Deletion failed', code: 'FAILED_DELETE' };
      server.use(
        http.delete(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
          HttpResponse.json(errorResponse, { status: 403 }) // Forbidden
        )
      );

      const response = await api.delete(endpoint);

      expect(response.data).toBeUndefined();
      expect(response.status).toBe(403);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(errorResponse.code);
      expect(response.error?.message).toBe(errorResponse.message);
    });

    // Test for AuthRequiredError on DELETE
    it('should THROW AuthRequiredError on DELETE 401 AUTH_REQUIRED', async () => {
        const errorResponse = { message: 'Login required', code: 'AUTH_REQUIRED' };
        server.use(
            http.delete(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () =>
                HttpResponse.json(errorResponse, { status: 401 })
            )
        );

        // Assert that the correct error is thrown
        await expect(api.delete(endpoint)).rejects.toThrow(AuthRequiredError);
    });
  });
  // ---> END NEW TESTS for api.delete <---

  // Keep existing tests for Realtime methods etc. if they exist
}); 