import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { api, initializeApiClient, _resetApiClient, ApiError } from './apiClient';
import { server } from './setupTests'; // <-- Import the shared server

// Mock the base URL and key
const MOCK_BASE_URL = 'http://mock-supabase.co';
const MOCK_ANON_KEY = 'mock-anon-key';

describe('apiClient', () => {
  beforeEach(() => {
    // Reset FIRST, then initialize
    _resetApiClient(); 
    initializeApiClient({ baseUrl: MOCK_BASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
  });

  afterEach(() => {
    _resetApiClient();
    server.resetHandlers(); // Also reset MSW handlers (redundant with global setup, but safe)
  });

  describe('initializeApiClient', () => {
    it('should throw error if called more than once', () => {
      // Already called in beforeEach
      expect(() => initializeApiClient({ baseUrl: 'another', supabaseAnonKey: 'key' }))
        .toThrow('API client already initialized');
    });
    
    // Note: Testing if it sets values correctly is implicitly done by other tests
  });

  describe('api.get', () => {
    it('should perform a GET request to the correct endpoint', async () => {
      const endpoint = 'test-get';
      const mockData = { message: 'Success' };
      server.use(
        http.get(`${MOCK_BASE_URL}/${endpoint}`, () => HttpResponse.json(mockData))
      );
      const data = await api.get(endpoint);
      expect(data).toEqual(mockData);
    });

    it('should include Authorization header when token is provided', async () => {
      const endpoint = 'test-auth-get';
      const mockToken = 'mock-jwt-token';
      server.use(
        http.get(`${MOCK_BASE_URL}/${endpoint}`, async ({ request }) => {
          expect(request.headers.get('Authorization')).toBe(`Bearer ${mockToken}`);
          return HttpResponse.json({});
        })
      );
      await api.get(endpoint, { token: mockToken });
    });
    
    it('should NOT include Authorization header for public requests even if token is provided', async () => {
      const endpoint = 'test-public-get';
      const mockToken = 'mock-jwt-token';
      server.use(
        http.get(`${MOCK_BASE_URL}/${endpoint}`, async ({ request }) => {
          expect(request.headers.get('Authorization')).toBeNull();
          return HttpResponse.json({});
        })
      );
      await api.get(endpoint, { token: mockToken, isPublic: true });
    });

    it('should throw ApiError on network error', async () => {
      const endpoint = 'test-network-error';
      server.use(
        http.get(`${MOCK_BASE_URL}/${endpoint}`, () => HttpResponse.error())
      );

      // Test that it throws the specific ApiError class
      await expect(api.get(endpoint)).rejects.toThrow(ApiError);
      // Test that the thrown error message matches the wrapped network error
      await expect(api.get(endpoint)).rejects.toThrow(/^Network error: Failed to fetch$/);
    });

    it('should throw ApiError with status and message on API error response', async () => {
      const endpoint = 'test-api-error';
      const errorResponse = { message: 'Invalid request', code: 'INVALID_INPUT' };
      server.use(
        http.get(`${MOCK_BASE_URL}/${endpoint}`, () => 
          HttpResponse.json(errorResponse, { status: 400 })
        )
      );
      try {
        await api.get(endpoint);
        expect.fail('Expected API call to throw');
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toBe(errorResponse.message);
        expect(error.code).toBe(errorResponse.code);
      }
    });
    
    it('should throw ApiError with default message if API error response has no message/code', async () => {
      const endpoint = 'test-empty-error';
      server.use(
        http.get(`${MOCK_BASE_URL}/${endpoint}`, () => 
          HttpResponse.json({}, { status: 500 })
        )
      );

      await expect(api.get(endpoint)).rejects.toThrow(/^HTTP error 500$/);
    });

  });

  // TODO: Add tests for api.post, api.put, api.delete
}); 