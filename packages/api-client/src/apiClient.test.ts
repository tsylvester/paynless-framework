import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { api, initializeApiClient, _resetApiClient, ApiError, ApiClient, AuthRequiredError } from './apiClient';
import { server } from './setupTests'; // <-- Import the shared server
// Remove direct SupabaseClient import if no longer needed here
// import { SupabaseClient } from '@supabase/supabase-js'; // Import SupabaseClient type
// Import the mock utility
import { mockSupabaseAuthSession, MOCK_ACCESS_TOKEN } from './mocks/supabase.mock';

// Mock the base URL and key
const MOCK_SUPABASE_URL = 'http://mock-supabase.co'; // Renamed for clarity
const MOCK_ANON_KEY = 'mock-anon-key';
// Use MOCK_ACCESS_TOKEN from the utility file
// const MOCK_ACCESS_TOKEN = 'mock-test-access-token';

describe('apiClient', () => {
  let internalApiClientInstance: ApiClient; // To hold the instance for mocking

  beforeEach(() => {
    _resetApiClient(); 
    initializeApiClient({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
    
    // Get the internal instance AFTER initialization for mocking
    // Hacky way: access through the exported api object
    internalApiClientInstance = api.billing().apiClient; 

    // Use the utility function to mock the session
    mockSupabaseAuthSession(internalApiClientInstance);
  });

  afterEach(() => {
    _resetApiClient();
    server.resetHandlers();
    vi.restoreAllMocks(); // Restore mocks after each test
  });

  describe('initializeApiClient', () => {
    it('should throw error if called more than once', () => {
      expect(() => initializeApiClient({ supabaseUrl: 'another-url', supabaseAnonKey: 'key' }))
        .toThrow('ApiClient already initialized'); // Corrected error message
    });
    
    // Note: Testing if it sets values correctly is implicitly done by other tests
  });

  describe('api.get', () => {
    // Test needs to use MOCK_SUPABASE_URL + /functions/v1 for MSW matching
    const MOCK_FUNCTIONS_URL = `${MOCK_SUPABASE_URL}/functions/v1`;

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

    it('should include Authorization header when NOT using explicit token option', async () => {
      const endpoint = 'test-auth-get';
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, async ({ request }) => {
          // Expect the token from the mocked getSession
          expect(request.headers.get('Authorization')).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`); 
          return HttpResponse.json({});
        })
      );
      // Call without explicit token, should use mocked session
      await api.get(endpoint); 
    });
    
    it('should NOT include Authorization header for public requests even if session exists', async () => {
      const endpoint = 'test-public-get';
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, async ({ request }) => {
          expect(request.headers.get('Authorization')).toBeNull();
          return HttpResponse.json({});
        })
      );
       // Call public endpoint, should ignore mocked session
      await api.get(endpoint, { isPublic: true });
    });

    it('should return ApiResponse with network error object on network error', async () => {
      const endpoint = 'test-network-error';
      // Use http.error() to simulate network failure
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => http.error())
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

    it('should return ApiResponse with API error object on 500 API error response', async () => {
      const endpoint = 'test-api-error-500';
      const errorResponse = { message: 'Server exploded' }; // No code provided
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => 
          HttpResponse.json(errorResponse, { status: 500 })
        )
      );
      const response = await api.get(endpoint);
      expect(response.data).toBeUndefined();
      expect(response.status).toBe(500);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('500'); // Status code as string
      expect(response.error?.message).toBe(errorResponse.message); // Extracts message correctly
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
        await expect(api.get(endpoint)).rejects.toThrowError(AuthRequiredError);
        // Can also check the message if needed
        // await expect(api.get(endpoint)).rejects.toThrow(errorResponse.message);

        // Verify sessionStorage call
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

  // TODO: Add tests for api.post, api.put, api.delete
}); 