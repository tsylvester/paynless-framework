import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import type {
  ListStageDocumentsPayload,
  StageRunDocumentDescriptor,
  GetAllStageProgressPayload,
  GetAllStageProgressResponse,
  ApiError,
  ApiResponse,
} from '@paynless/types';
import { mockApiClient, resetMockApiClient } from './mocks/apiClient.mock';

describe('DialecticApiClient - Document Listing', () => {
  let dialecticApiClient: DialecticApiClient;

  beforeEach(() => {
    resetMockApiClient();
    dialecticApiClient = new DialecticApiClient(mockApiClient);
  });

  describe('listStageDocuments', () => {
    it('should call the post method with the correct action and payload for successful fetch', async () => {
      const payload: ListStageDocumentsPayload = {
        sessionId: 'test-session-id',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        userId: 'test-user-id',
        projectId: 'test-project-id',
      };

      const mockResponseData: StageRunDocumentDescriptor[] = [{
        status: 'completed',
        job_id: 'job-123',
        latestRenderedResourceId: 'resource-456',
        modelId: 'gpt-4',
        versionHash: 'hash-abc',
        lastRenderedResourceId: 'resource-456',
        lastRenderAtIso: new Date().toISOString(),
      }];
      
      const mockApiResponse: ApiResponse<StageRunDocumentDescriptor[]> = {
        data: mockResponseData,
        error: undefined,
        status: 200,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.listStageDocuments(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'listStageDocuments',
          payload,
        }
      );
      expect(result.data).toEqual(mockResponseData);
      expect(result.error).toBeUndefined();
    });

    it('should return an error when the API call fails', async () => {
      const payload: ListStageDocumentsPayload = {
        sessionId: 'test-session-id',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        userId: 'test-user-id',
        projectId: 'test-project-id',
      };
      const mockError: ApiError = { message: 'Internal Server Error', code: '500' };
      
      const mockApiResponse: ApiResponse<StageRunDocumentDescriptor[]> = {
        data: undefined,
        error: mockError,
        status: 500,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.listStageDocuments(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'listStageDocuments',
          payload,
        }
      );
      expect(result.data).toBeUndefined();
      expect(result.error).toEqual(mockError);
    });

    it('should handle an empty array response for successful fetch', async () => {
      const payload: ListStageDocumentsPayload = {
        sessionId: 'test-session-id',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        userId: 'test-user-id',
        projectId: 'test-project-id',
      };

      const mockApiResponse: ApiResponse<StageRunDocumentDescriptor[]> = {
        data: [],
        error: undefined,
        status: 200,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.listStageDocuments(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'listStageDocuments',
          payload,
        }
      );
      expect(result.data).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('should handle multiple documents in the response', async () => {
      const payload: ListStageDocumentsPayload = {
        sessionId: 'test-session-id',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        userId: 'test-user-id',
        projectId: 'test-project-id',
      };

      const mockResponseData: StageRunDocumentDescriptor[] = [
        {
          status: 'completed',
          job_id: 'job-123',
          latestRenderedResourceId: 'resource-456',
          modelId: 'gpt-4',
          versionHash: 'hash-abc',
          lastRenderedResourceId: 'resource-456',
          lastRenderAtIso: new Date().toISOString(),
        },
        {
          status: 'generating',
          job_id: 'job-124',
          latestRenderedResourceId: '',
          modelId: 'claude-3',
          versionHash: 'hash-def',
          lastRenderedResourceId: '',
          lastRenderAtIso: new Date().toISOString(),
        },
      ];
      
      const mockApiResponse: ApiResponse<StageRunDocumentDescriptor[]> = {
        data: mockResponseData,
        error: undefined,
        status: 200,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.listStageDocuments(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'listStageDocuments',
          payload,
        }
      );
      expect(result.data).toEqual(mockResponseData);
      expect(result.error).toBeUndefined();
    });

    it('should handle a network error gracefully', async () => {
      const payload: ListStageDocumentsPayload = {
        sessionId: 'test-session-id',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        userId: 'test-user-id',
        projectId: 'test-project-id',
      };
      const networkError = new Error('Network request failed');
      vi.mocked(mockApiClient.post).mockRejectedValue(networkError);

      const result = await dialecticApiClient.listStageDocuments(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'listStageDocuments',
          payload,
        }
      );
      expect(result.data).toBeUndefined();
      expect(result.error).toEqual({
        code: 'NETWORK_ERROR',
        message: 'Network request failed',
      });
    });
  });

  describe('getAllStageProgress', () => {
    it('should call the post method with the correct action and payload for successful fetch', async () => {
      const payload: GetAllStageProgressPayload = {
        sessionId: 'test-session-id',
        iterationNumber: 1,
        userId: 'test-user-id',
        projectId: 'test-project-id',
      };

      const mockResponseData: GetAllStageProgressResponse = {
        dagProgress: { completedStages: 1, totalStages: 1 },
        stages: [
          {
            stageSlug: 'thesis',
          documents: [
            {
              documentKey: 'feature_spec',
              status: 'completed',
              jobId: 'job-123',
              latestRenderedResourceId: 'resource-456',
              modelId: 'gpt-4',
            },
          ],
          steps: [{ stepKey: 'feature_spec', status: 'completed' }],
          status: 'completed',
          modelCount: 1,
          progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 },
          },
        ],
      };

      const mockApiResponse: ApiResponse<GetAllStageProgressResponse> = {
        data: mockResponseData,
        error: undefined,
        status: 200,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.getAllStageProgress(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getAllStageProgress',
          payload,
        }
      );
      expect(result.data).toEqual(mockResponseData);
      expect(result.error).toBeUndefined();
    });

    it('should return an error when the API call fails', async () => {
      const payload: GetAllStageProgressPayload = {
        sessionId: 'test-session-id',
        iterationNumber: 1,
        userId: 'test-user-id',
        projectId: 'test-project-id',
      };
      const mockError: ApiError = { message: 'Internal Server Error', code: '500' };

      const mockApiResponse: ApiResponse<GetAllStageProgressResponse> = {
        data: undefined,
        error: mockError,
        status: 500,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.getAllStageProgress(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getAllStageProgress',
          payload,
        }
      );
      expect(result.data).toBeUndefined();
      expect(result.error).toEqual(mockError);
    });

    it('should handle an empty array response for successful fetch', async () => {
      const payload: GetAllStageProgressPayload = {
        sessionId: 'test-session-id',
        iterationNumber: 1,
        userId: 'test-user-id',
        projectId: 'test-project-id',
      };

      const mockApiResponse: ApiResponse<GetAllStageProgressResponse> = {
        data: {
          dagProgress: { completedStages: 0, totalStages: 0 },
          stages: [],
        },
        error: undefined,
        status: 200,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.getAllStageProgress(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getAllStageProgress',
          payload,
        }
      );
      expect(result.data).toEqual({
        dagProgress: { completedStages: 0, totalStages: 0 },
        stages: [],
      });
      expect(result.error).toBeUndefined();
    });

    it('should handle a network error gracefully', async () => {
      const payload: GetAllStageProgressPayload = {
        sessionId: 'test-session-id',
        iterationNumber: 1,
        userId: 'test-user-id',
        projectId: 'test-project-id',
      };
      const networkError = new Error('Network request failed');
      vi.mocked(mockApiClient.post).mockRejectedValue(networkError);

      const result = await dialecticApiClient.getAllStageProgress(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getAllStageProgress',
          payload,
        }
      );
      expect(result.data).toBeUndefined();
      expect(result.error).toEqual({
        code: 'NETWORK_ERROR',
        message: 'Network request failed',
      });
    });
  });
});
