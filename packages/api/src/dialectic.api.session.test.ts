import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import type { ApiClient } from './apiClient';
import type { ApiResponse, DialecticSession, ApiError as ApiErrorType } from '@paynless/types';

// Mock the base ApiClient consistent with other API client tests
const mockApiClientPost = vi.fn();
const mockApiClient = {
  get: vi.fn(),
  post: mockApiClientPost,
  put: vi.fn(),
  patch: vi.fn(), // Added for consistency, though not used by getSessionDetails
  delete: vi.fn(),
  // No need to mock auth methods like setAuthToken, getAuthToken etc.,
  // as the DialecticApiClient methods themselves don't call them directly;
  // those are handled by the core ApiClient implementation.
} as unknown as ApiClient;

// Create an instance of the class we are testing
const dialecticApiClient = new DialecticApiClient(mockApiClient);

describe('DialecticApiClient - Session Methods', () => {
  beforeEach(() => {
    vi.resetAllMocks(); // Use resetAllMocks for consistency
  });

  describe('getSessionDetails', () => {
    const sessionId = 'session-xyz-789';
    const mockSessionData: DialecticSession = {
      id: sessionId,
      project_id: 'project-abc-123',
      session_description: 'Test session details',
      iteration_count: 1,
      selected_model_catalog_ids: [],
      status: 'active',
      current_stage_id: 'stage-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Add other required fields for DialecticSession with default/mock values
      user_input_reference_url: null,
      associated_chat_id: null,
      dialectic_session_models: [],
      dialectic_contributions: [],
      feedback: [],
    };

    it('should call apiClient.post with correct parameters for getSessionDetails', async () => {
      mockApiClientPost.mockResolvedValueOnce({ data: mockSessionData, error: null, status: 200 });

      await dialecticApiClient.getSessionDetails(sessionId);

      expect(mockApiClientPost).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getSessionDetails',
          payload: { sessionId },
        }
      );
    });

    it('should return session data on successful fetch', async () => {
      const expectedResponse: ApiResponse<DialecticSession> = { data: mockSessionData, error: undefined, status: 200 };
      mockApiClientPost.mockResolvedValueOnce(expectedResponse);

      const result = await dialecticApiClient.getSessionDetails(sessionId);

      expect(result).toEqual(expectedResponse);
    });

    it('should return an error if apiClient.post returns an error', async () => {
      const apiError: ApiErrorType = { message: 'Failed to fetch session', code: 'API_ERROR' };
      const expectedResponse: ApiResponse<DialecticSession> = { data: undefined, error: apiError, status: 500 };
      mockApiClientPost.mockResolvedValueOnce(expectedResponse);

      const result = await dialecticApiClient.getSessionDetails(sessionId);

      expect(result).toEqual(expectedResponse);
    });

    it('should handle network errors by returning an error response', async () => {
      const networkError = new Error('Network connection failed');
      mockApiClientPost.mockRejectedValueOnce(networkError);

      const result = await dialecticApiClient.getSessionDetails(sessionId);

      expect(result.data).toBeUndefined();
      expect(result.error).toEqual({
        code: 'NETWORK_ERROR',
        message: networkError.message,
      });
      expect(result.status).toBe(0);
    });
  });
}); 