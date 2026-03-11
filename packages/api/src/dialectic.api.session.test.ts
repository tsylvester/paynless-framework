import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import type { ApiClient } from './apiClient';
import type {
  ApiResponse,
  DialecticSession,
  ApiError,
  GetSessionDetailsResponse,
  DialecticStage,
  AssembledPrompt,
  UpdateViewingStagePayload,
  UpdateViewingStageParams,
  UpdateViewingStageDeps,
  UpdateViewingStageReturn,
} from '@paynless/types';
import { Database } from '@paynless/db-types';

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
      selected_models: [],
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
      expected_output_template_ids: [],
      active_recipe_instance_id: null,
      recipe_template_id: null,
      minimum_balance: 0,
    };

    it('should call apiClient.post with sessionId only when skipSeedPrompt is not provided', async () => {
      mockApiClientPost.mockResolvedValueOnce({ 
        data: { session: mockSessionData, currentStageDetails: mockStageData, activeSeedPrompt: null }, 
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

    it('should call apiClient.post with skipSeedPrompt true when skipSeedPrompt parameter is true', async () => {
      mockApiClientPost.mockResolvedValueOnce({ 
        data: { session: mockSessionData, currentStageDetails: mockStageData, activeSeedPrompt: null }, 
        error: null, 
        status: 200 
      });

      await dialecticApiClient.getSessionDetails(sessionId, true);

      expect(mockApiClientPost).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getSessionDetails',
          payload: { sessionId, skipSeedPrompt: true },
        }
      );
    });

    it('should call apiClient.post with skipSeedPrompt false when skipSeedPrompt parameter is false', async () => {
      mockApiClientPost.mockResolvedValueOnce({ 
        data: { session: mockSessionData, currentStageDetails: mockStageData, activeSeedPrompt: null }, 
        error: null, 
        status: 200 
      });

      await dialecticApiClient.getSessionDetails(sessionId, false);

      expect(mockApiClientPost).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getSessionDetails',
          payload: { sessionId, skipSeedPrompt: false },
        }
      );
    });

    it('should return session data with activeSeedPrompt when skipSeedPrompt is false', async () => {
      const mockActiveSeedPrompt: AssembledPrompt = {
        promptContent: 'Mock seed prompt content',
        source_prompt_resource_id: 'resource-123',
      };
      const expectedResponse: ApiResponse<GetSessionDetailsResponse> = { 
        data: { session: mockSessionData, currentStageDetails: mockStageData, activeSeedPrompt: mockActiveSeedPrompt }, 
        error: undefined, 
        status: 200 
      };
      mockApiClientPost.mockResolvedValueOnce(expectedResponse);

      const result = await dialecticApiClient.getSessionDetails(sessionId, false);

      expect(mockApiClientPost).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getSessionDetails',
          payload: { sessionId, skipSeedPrompt: false },
        }
      );
      expect(result.data?.activeSeedPrompt).toEqual(mockActiveSeedPrompt);
    });

    it('should return session data with activeSeedPrompt null when skipSeedPrompt is true', async () => {
      const expectedResponse: ApiResponse<GetSessionDetailsResponse> = { 
        data: { session: mockSessionData, currentStageDetails: mockStageData, activeSeedPrompt: null }, 
        error: undefined, 
        status: 200 
      };
      mockApiClientPost.mockResolvedValueOnce(expectedResponse);

      const result = await dialecticApiClient.getSessionDetails(sessionId, true);

      expect(mockApiClientPost).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getSessionDetails',
          payload: { sessionId, skipSeedPrompt: true },
        }
      );
      expect(result.data?.activeSeedPrompt).toBeNull();
    });

    it('should return session data with activeSeedPrompt when skipSeedPrompt is not provided', async () => {
      const mockActiveSeedPrompt: AssembledPrompt = {
        promptContent: 'Default behavior seed prompt',
        source_prompt_resource_id: 'resource-789',
      };
      const expectedResponse: ApiResponse<GetSessionDetailsResponse> = { 
        data: { session: mockSessionData, currentStageDetails: mockStageData, activeSeedPrompt: mockActiveSeedPrompt }, 
        error: undefined, 
        status: 200 
      };
      mockApiClientPost.mockResolvedValueOnce(expectedResponse);

      const result = await dialecticApiClient.getSessionDetails(sessionId);

      expect(result.data?.activeSeedPrompt).toEqual(mockActiveSeedPrompt);
    });

    it('should return an error if apiClient.post returns an error', async () => {
      const apiError: ApiError = { message: 'Failed to fetch session', code: 'API_ERROR' };
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

  describe('updateViewingStage', () => {
    const endpoint = 'dialectic-service';
    const validPayload: UpdateViewingStagePayload = {
      sessionId: 'sess-view-456',
      viewingStageId: 'stage-view-789',
    };
    const requestBody = { action: 'updateViewingStage', payload: validPayload };
    const mockUpdatedSession: Database["public"]["Tables"]["dialectic_sessions"]["Row"] = {
      id: validPayload.sessionId,
      project_id: 'project-abc-123',
      session_description: 'Test session',
      iteration_count: 1,
      selected_model_ids: [],
      status: 'active',
      current_stage_id: 'stage-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_input_reference_url: null,
      associated_chat_id: null,
      viewing_stage_id: validPayload.viewingStageId,  
      idempotency_key: null,
    };

    it('should call apiClient.post with the correct endpoint and body', async () => {
      const mockResponse: UpdateViewingStageReturn = {
        data: mockUpdatedSession,
        error: null,
        status: 200,
      };
      mockApiClientPost.mockResolvedValueOnce(mockResponse);

      const deps: UpdateViewingStageDeps = {};
      const params: UpdateViewingStageParams = {userId: 'user-123' };
      
      await dialecticApiClient.updateViewingStage(deps, params, validPayload);

      expect(mockApiClientPost).toHaveBeenCalledTimes(1);
      expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
    });

    it('should return ApiResponse<DialecticSession> on success', async () => {
      const mockResponse: UpdateViewingStageReturn = {
        data: mockUpdatedSession,
        error: null,
        status: 200,
      };
      mockApiClientPost.mockResolvedValueOnce(mockResponse);

      const deps: UpdateViewingStageDeps = {};
      const params: UpdateViewingStageParams = {userId: 'user-123' };
      const result = await dialecticApiClient.updateViewingStage(deps, params, validPayload);

      expect(result.data).toEqual(mockUpdatedSession);
      expect(result.status).toBe(200);
      expect(result.error).toBeNull();
    });
  });
}); 