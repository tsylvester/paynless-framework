import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { api, initializeApiClient, _resetApiClient, ApiError, ApiClient } from './apiClient';
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
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => HttpResponse.error())
      );
      const response = await api.get(endpoint);
      expect(response.data).toBeUndefined();
      expect(response.status).toBe(0);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('NETWORK_ERROR');
      expect(response.error?.message).toBe('Failed to fetch');
    });

    it('should return ApiResponse with API error object on API error response', async () => {
      const endpoint = 'test-api-error';
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
    
    it('should return ApiResponse with constructed API error if API error response has no message/code', async () => {
      const endpoint = 'test-empty-error';
      server.use(
        http.get(`${MOCK_FUNCTIONS_URL}/${endpoint}`, () => 
          HttpResponse.json({}, { status: 500 })
        )
      );
      const response = await api.get(endpoint);
      expect(response.data).toBeUndefined();
      expect(response.status).toBe(500);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('500'); // Status code as string
      expect(response.error?.message).toMatch(/^Internal Server Error/); // Default status text
    });

  });

  // TODO: Add tests for api.post, api.put, api.delete
}); 