import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import type {
  GetStageDocumentFeedbackPayload,
  SubmitStageDocumentFeedbackPayload,
  StageDocumentFeedback,
  ApiError,
  ApiResponse,
} from '@paynless/types';
import { mockApiClient, resetMockApiClient } from './mocks/apiClient.mock';

describe('DialecticApiClient - Document Feedback', () => {
  let dialecticApiClient: DialecticApiClient;

  beforeEach(() => {
    resetMockApiClient();
    dialecticApiClient = new DialecticApiClient(mockApiClient);
  });

  describe('getStageDocumentFeedback', () => {
    it('should call the post method with the correct action and payload for successful fetch', async () => {
      const payload: GetStageDocumentFeedbackPayload = {
        sessionId: 'test-session-id',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        modelId: 'gpt-4',
        documentKey: 'draft_document_outline',
      };

      const mockResponseData: StageDocumentFeedback[] = [{
        id: 'feedback-1',
        content: 'This is a test feedback.',
        createdAt: new Date().toISOString(),
      }];
      
      const mockApiResponse: ApiResponse<StageDocumentFeedback[]> = {
        data: mockResponseData,
        error: undefined,
        status: 200,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.getStageDocumentFeedback(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getStageDocumentFeedback',
          payload,
        }
      );
      expect(result.data).toEqual(mockResponseData);
      expect(result.error).toBeUndefined();
    });

    it('should return an error when the API call fails', async () => {
      const payload: GetStageDocumentFeedbackPayload = {
        sessionId: 'test-session-id',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        modelId: 'gpt-4',
        documentKey: 'draft_document_outline',
      };
      const mockError: ApiError = { message: 'Internal Server Error', code: '500' };
      
      const mockApiResponse: ApiResponse<StageDocumentFeedback[]> = {
        data: undefined,
        error: mockError,
        status: 500,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.getStageDocumentFeedback(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'getStageDocumentFeedback',
          payload,
        }
      );
      expect(result.data).toBeUndefined();
      expect(result.error).toEqual(mockError);
    });
  });

  describe('submitStageDocumentFeedback', () => {
    it('should call the post method with the correct action and payload for successful submission', async () => {
      const payload: SubmitStageDocumentFeedbackPayload = {
        sessionId: 'test-session-id',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        modelId: 'gpt-4',
        documentKey: 'draft_document_outline',
        feedback: 'This is my submitted feedback.',
      };

      const mockApiResponse: ApiResponse<{ success: boolean }> = {
        data: { success: true },
        error: undefined,
        status: 200,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.submitStageDocumentFeedback(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'submitStageDocumentFeedback',
          payload,
        }
      );
      expect(result.data).toEqual({ success: true });
      expect(result.error).toBeUndefined();
    });

    it('should return an error when the API call fails', async () => {
      const payload: SubmitStageDocumentFeedbackPayload = {
        sessionId: 'test-session-id',
        stageSlug: 'synthesis',
        iterationNumber: 1,
        modelId: 'gpt-4',
        documentKey: 'draft_document_outline',
        feedback: 'This is my submitted feedback.',
      };
      const mockError: ApiError = { message: 'Failed to submit', code: '400' };

      const mockApiResponse: ApiResponse<{ success: boolean }> = {
        data: undefined,
        error: mockError,
        status: 400,
      };

      vi.mocked(mockApiClient.post).mockResolvedValue(mockApiResponse);

      const result = await dialecticApiClient.submitStageDocumentFeedback(payload);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        'dialectic-service',
        {
          action: 'submitStageDocumentFeedback',
          payload,
        }
      );
      expect(result.data).toBeUndefined();
      expect(result.error).toEqual(mockError);
    });
  });
});