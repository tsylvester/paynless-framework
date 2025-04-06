import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { api, initializeApiClient, _resetApiClient, ApiError } from './apiClient';
import { server } from './setupTests'; // <-- Import the shared server

// Mock the base URL and key
const MOCK_BASE_URL = 'http://mock-supabase.co';
const MOCK_ANON_KEY = 'mock-anon-key';

describe('apiClient', () => {
  beforeEach(() => {
    // Ensure the client is initialized before each test in this suite
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
      const endpoint = '/test-get';
      const expectedData = { success: true, data: 'get data' };

      server.use(
        http.get(`${MOCK_BASE_URL}${endpoint}`, ({ request }) => {
          // Check headers if necessary (e.g., apikey)
          expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
          return HttpResponse.json(expectedData);
        })
      );

      const result = await api.get(endpoint);
      expect(result).toEqual(expectedData.data);
    });

    it('should include Authorization header when token is provided', async () => {
        const endpoint = '/test-auth-get';
        const token = 'test-jwt-token';
        const expectedData = { authorized: true };

        server.use(
            http.get(`${MOCK_BASE_URL}${endpoint}`, ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${token}`);
                expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
                return HttpResponse.json(expectedData);
            })
        );

        const result = await api.get(endpoint, { token });
        expect(result).toEqual(expectedData);
    });
    
    it('should NOT include Authorization header for public requests even if token is provided', async () => {
        const endpoint = '/test-public-get';
        const token = 'test-jwt-token'; // Token provided but should be ignored
        const expectedData = { public: true };

        server.use(
            http.get(`${MOCK_BASE_URL}${endpoint}`, ({ request }) => {
                expect(request.headers.has('Authorization')).toBe(false); // No Auth header
                expect(request.headers.get('apikey')).toBe(MOCK_ANON_KEY);
                return HttpResponse.json(expectedData);
            })
        );

        // Mark as public, provide token
        const result = await api.get(endpoint, { isPublic: true, token });
        expect(result).toEqual(expectedData);
    });

    it('should throw ApiError on network error', async () => {
      const endpoint = '/test-network-error';
      server.use(
        http.get(`${MOCK_BASE_URL}${endpoint}`, () => {
          // Simulate network error
          return HttpResponse.error(); 
        })
      );

      await expect(api.get(endpoint)).rejects.toThrow(ApiError);
      await expect(api.get(endpoint)).rejects.toThrow(/^Failed to fetch$/);
    });

    it('should throw ApiError with status and message on API error response', async () => {
      const endpoint = '/test-api-error';
      const errorResponse = { message: 'Invalid request', code: 'INVALID' };
      const status = 400;

      server.use(
        http.get(`${MOCK_BASE_URL}${endpoint}`, () => {
          return HttpResponse.json(errorResponse, { status });
        })
      );

      try {
        await api.get(endpoint);
        expect.fail('Expected api.get to throw');
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toBe(errorResponse.message);
        expect(error.code).toBe(errorResponse.code);
      }
    });
    
    it('should throw ApiError with default message if API error response has no message/code', async () => {
      const endpoint = '/test-empty-error';
      const status = 500;

      server.use(
        http.get(`${MOCK_BASE_URL}${endpoint}`, () => {
          return HttpResponse.json({}, { status }); // Empty error body
        })
      );

      await expect(api.get(endpoint)).rejects.toThrow(/^HTTP error 500$/);
    });

  });

  // TODO: Add tests for api.post, api.put, api.delete
}); 