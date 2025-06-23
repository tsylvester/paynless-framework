import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import type { ApiClient } from './apiClient';
import type {
  ApiResponse,
  DialecticSession,
  ApiError as ApiErrorType,
  GetSessionDetailsResponse,
  DialecticStage,
} from '@paynless/types';

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

    // Added mockStageData
    const mockStageData: DialecticStage = {
      id: 'stage-1',
      slug: 'hypothesis-generation',
      display_name: 'Hypothesis Generation',
      description: 'Generate initial hypotheses.',
      default_system_prompt_id: 'default-system-prompt-hypothesis',
      // expected_contribution_count: 3, // Removed
      // display_order: 1, // Removed
      created_at: new Date().toISOString(),
      // updated_at: new Date().toISOString(), // This is not in the base type from the previous error
      // project_process_template_id: 'template-123', // Removed
      // user_id: null, // Removed
      // permissions: 'edit', // Removed
      // template_stage_id: 'original-template-stage-id' // Removed
      // Add properties that ARE part of DialecticStage (Database['public']['Tables']['dialectic_stages']['Row'])
      // For example, if 'expected_output_artifacts' and 'input_artifact_rules' are required and are of type Json:
      expected_output_artifacts: {}, // or null if nullable, or valid Json
      input_artifact_rules: {}, // or null if nullable, or valid Json
    };

    it('should call apiClient.post with correct parameters for getSessionDetails', async () => {
      // Mock with the new GetSessionDetailsResponse structure
      mockApiClientPost.mockResolvedValueOnce({ 
        data: { session: mockSessionData, currentStageDetails: mockStageData }, 
        error: null, 
        status: 200 
      });

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
      // Updated expectedResponse to use GetSessionDetailsResponse
      const mockApiResponseData: GetSessionDetailsResponse = { 
        session: mockSessionData, 
        currentStageDetails: mockStageData 
      };
      const expectedResponse: ApiResponse<GetSessionDetailsResponse> = { 
        data: mockApiResponseData, 
        error: undefined, 
        status: 200 
      };
      mockApiClientPost.mockResolvedValueOnce(expectedResponse);

      const result = await dialecticApiClient.getSessionDetails(sessionId);

      expect(result).toEqual(expectedResponse);
    });

    it('should return an error if apiClient.post returns an error', async () => {
      const apiError: ApiErrorType = { message: 'Failed to fetch session', code: 'API_ERROR' };
      // Return type for error remains ApiResponse<GetSessionDetailsResponse> but data is undefined
      const expectedResponse: ApiResponse<GetSessionDetailsResponse> = { 
        data: undefined, 
        error: apiError, 
        status: 500 
      };
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