import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import { mockApiClient, resetMockApiClient } from './mocks/apiClient.mock';
import {
    ApiResponse,
    ApiError,
    StartSessionPayload,
    DialecticSession,
    AiProvidersRow,
    DialecticServiceActionPayload,
    DialecticContribution,
    DialecticStage,
    GenerateContributionsPayload,
    GenerateContributionsResponse,
    SubmitStageResponsesPayload,
    SubmitStageResponsesResponse,
    SaveContributionEditPayload,
    GetIterationInitialPromptPayload,
    IterationInitialPromptData,
    UpdateSessionModelsPayload,
    GetContributionContentDataResponse,
} from '@paynless/types';
import {
    mockDialecticStage,
    mockDialecticContribution,
    mockSession,
    mockSelectedModel,
    mockAiProvidersRow,
} from '../../../apps/web/src/mocks/dialecticStore.mock';

const mockDialecticSession: DialecticSession = mockSession({
    id: 'sess-456',
    project_id: 'proj-123',
    session_description: 'Test Session',
    status: 'pending_hypothesis',
    current_stage_id: 'stage-123',
    viewing_stage_id: null,
});

describe('DialecticApiClient', () => {
    let dialecticApiClient: DialecticApiClient;

    beforeEach(() => {
        resetMockApiClient();
        dialecticApiClient = new DialecticApiClient(mockApiClient);
    });
   
    describe('generateContributions', () => {
        const endpoint = 'dialectic-service';
        const mockStageObject: DialecticStage = mockDialecticStage({
            description: null,
            default_system_prompt_id: null,
            minimum_balance: 0,
        });
        
            const validPayload: GenerateContributionsPayload = {
            idempotencyKey: 'test-idem-gen-1',
            sessionId: 'sess-456',
            projectId: 'proj-123',
            stageSlug: mockStageObject.slug,
            iterationNumber: 1,
            continueUntilComplete: false,
            walletId: 'wallet-default',
        };
        const requestBody = { action: 'generateContributions', payload: validPayload };

        const mockContribution: DialecticContribution = mockDialecticContribution({
            id: 'contrib-xyz',
            session_id: 'sess-123',
            model_id: 'model-abc',
            model_name: 'GPT-4 Thesis Generator',
            user_id: 'user-abc',
            stage: mockStageObject.slug,
            iteration_number: 1,
            prompt_template_id_used: 'pt-thesis-default',
            seed_prompt_url: `projects/${validPayload.projectId}/sessions/${validPayload.sessionId}/iteration_1/thesis/seed_prompt.md`,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: `projects/${validPayload.projectId}/sessions/${validPayload.sessionId}/iteration_1/thesis/contrib-xyz_raw.json`,
            target_contribution_id: null,
            tokens_used_input: 100,
            tokens_used_output: 300,
            processing_time_ms: 5000,
            error: null,
            citations: null,
            storage_bucket: 'dialectic-contributions',
            storage_path: `projects/${validPayload.projectId}/sessions/${validPayload.sessionId}/iteration_1/thesis/contrib-xyz.md`,
            mime_type: 'text/markdown',
            size_bytes: 1500,
            contribution_type: 'ai',
            file_name: 'contrib-xyz.md',
        });

        const mockSuccessResponse: GenerateContributionsResponse = {
            sessionId: validPayload.sessionId,
            projectId: validPayload.projectId,
            stage: mockStageObject.slug,
            iteration: validPayload.iterationNumber,
            status: 'generating',
            job_ids: ['job-123'],
            successfulContributions: [mockContribution],
            failedAttempts: [],
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const apiResponse: ApiResponse<GenerateContributionsResponse> = {
                data: mockSuccessResponse,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(apiResponse);

            await dialecticApiClient.generateContributions(validPayload);

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should include idempotencyKey in payload sent to post', async () => {
            vi.mocked(mockApiClient.post).mockResolvedValue({ data: mockSuccessResponse, status: 200 });
            await dialecticApiClient.generateContributions(validPayload);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(
                endpoint,
                expect.objectContaining({ payload: expect.objectContaining({ idempotencyKey: validPayload.idempotencyKey }) })
            );
        });

        it('should return the generation response on successful execution', async () => {
            const apiResponse: ApiResponse<GenerateContributionsResponse> = {
                data: mockSuccessResponse,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(apiResponse);

            const result = await dialecticApiClient.generateContributions(validPayload);

            expect(result.data).toEqual(mockSuccessResponse);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed generation (e.g., session not found)', async () => {
            const mockApiError: ApiError = { code: 'NOT_FOUND', message: 'Session not found or generation failed' };
            const mockErrorResponse: ApiResponse<GenerateContributionsResponse> = {
                error: mockApiError,
                status: 404,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.generateContributions(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for generateContributions';
            vi.mocked(mockApiClient.post).mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.generateContributions(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });

        it('forwards walletId unchanged in the request payload', async () => {
            const payloadWithWallet = { ...validPayload, walletId: 'wallet-abc' };
            const apiResponse: ApiResponse<GenerateContributionsResponse> = {
                data: mockSuccessResponse,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(apiResponse);

            await dialecticApiClient.generateContributions(payloadWithWallet);

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, {
                action: 'generateContributions',
                payload: expect.objectContaining({ walletId: 'wallet-abc' }),
            });
        });
    });     
    
    describe('getContributionContentData', () => {
        const endpoint = 'dialectic-service';
        const contributionId = 'contrib-cdata-123';
        const requestBody: DialecticServiceActionPayload = {
            action: 'getContributionContentData',
            payload: { contributionId },
        };

        const mockContentDataResponse: GetContributionContentDataResponse = {
            content: 'This is the contribution content.',
            mimeType: 'text/markdown',
            sizeBytes: 1024,
            fileName: 'contribution.md',
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<GetContributionContentDataResponse | null> = {
                data: mockContentDataResponse,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            await dialecticApiClient.getContributionContentData(contributionId);

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the contribution content data on successful fetch', async () => {
            const mockResponse: ApiResponse<GetContributionContentDataResponse | null> = {
                data: mockContentDataResponse,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getContributionContentData(contributionId);

            expect(result.data).toEqual(mockContentDataResponse);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return null data if the contribution content is not found (e.g. backend returns null)', async () => {
            const mockResponse: ApiResponse<GetContributionContentDataResponse | null> = {
                data: null,
                status: 200, // Or 404, depending on backend implementation for not found with null data
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getContributionContentData(contributionId);

            expect(result.data).toBeNull();
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on other API failures', async () => {
            const mockApiError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to fetch content data' };
            const mockErrorResponse: ApiResponse<GetContributionContentDataResponse | null> = {
                error: mockApiError,
                status: 500,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getContributionContentData(contributionId);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for getContributionContentData';
            vi.mocked(mockApiClient.post).mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.getContributionContentData(contributionId);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });    
    
    describe('getIterationInitialPromptContent', () => {
        const endpoint = 'dialectic-service';
        const validPayload: GetIterationInitialPromptPayload = {
            sessionId: 'sess-456',
            iterationNumber: 1,
        };
        const requestBody = { action: 'getIterationInitialPromptContent', payload: validPayload };

        const mockPromptData: IterationInitialPromptData = {
            content: 'This is the initial prompt content for iteration 1.',
            mimeType: 'text/markdown',
            storagePath: `projects/proj-123/sessions/${validPayload.sessionId}/iteration_${validPayload.iterationNumber}/0_seed_inputs/user_prompt.md`,
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<IterationInitialPromptData> = {
                data: mockPromptData,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            await dialecticApiClient.getIterationInitialPromptContent(validPayload);

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the iteration initial prompt data on successful response', async () => {
            const mockResponse: ApiResponse<IterationInitialPromptData> = {
                data: mockPromptData,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getIterationInitialPromptContent(validPayload);

            expect(result.data).toEqual(mockPromptData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed fetch (e.g., prompt not found)', async () => {
            const mockApiError: ApiError = { code: 'NOT_FOUND', message: 'Initial prompt for iteration not found' };
            const mockErrorResponse: ApiResponse<IterationInitialPromptData> = {
                error: mockApiError,
                status: 404,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getIterationInitialPromptContent(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for getIterationInitialPromptContent';
            vi.mocked(mockApiClient.post).mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.getIterationInitialPromptContent(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });    
    
    describe('listModelCatalog', () => {
        const endpoint = 'dialectic-service';
        const requestBody = { action: 'listModelCatalog' };

        const mockModelCatalogEntry: AiProvidersRow = mockAiProvidersRow({
            id: 'model-cat-123',
            provider: 'OpenAI',
            name: 'GPT-4',
            api_identifier: 'gpt-4',
            description: 'Powerful model by OpenAI',
            is_active: true,
            is_default_generation: false,
            min_plan_tier_level: 10,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<AiProvidersRow[]> = {
                data: [mockModelCatalogEntry],
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            await dialecticApiClient.listModelCatalog();

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the model catalog array on successful response', async () => {
            const mockCatalogData: AiProvidersRow[] = [mockModelCatalogEntry];
            const mockResponse: ApiResponse<AiProvidersRow[]> = {
                data: mockCatalogData,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.data).toEqual(mockCatalogData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to fetch model catalog' };
            const mockErrorResponse: ApiResponse<AiProvidersRow[]> = {
                error: mockApiError,
                status: 500,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for listModelCatalog';
            vi.mocked(mockApiClient.post).mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });

        it('listModelCatalog returns entries including min_plan_tier_level', async () => {
            vi.mocked(mockApiClient.post).mockResolvedValue({ data: [mockModelCatalogEntry], status: 200 });

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.data).toBeDefined();
            expect(result.data?.length).toBe(1);
            expect(result.data?.[0].min_plan_tier_level).toBe(10);
            expect(result.error).toBeUndefined();
        });
    });    
    
    describe('saveContributionEdit', () => {
        const endpoint = 'dialectic-service';
        const validPayload: SaveContributionEditPayload = {
            originalContributionIdToEdit: 'contrib-original',
            editedContentText: 'This is the new and improved content.',
            projectId: 'proj-123',
            sessionId: 'sess-456',
            originalModelContributionId: 'contrib-model-original',
            responseText: 'User feedback on the edit.',
            documentKey: 'synthesis',
            resourceType: 'rendered_document',
        };
        const requestBody = { action: 'saveContributionEdit', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and payload', async () => {
            const expectedBody: DialecticServiceActionPayload = {
                action: 'saveContributionEdit',
                payload: validPayload
            };
            vi.mocked(mockApiClient.post).mockResolvedValue({ data: mockDialecticSession, status: 200 });

            await dialecticApiClient.saveContributionEdit(validPayload);

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, expectedBody);
        });

        it('should return the updated contribution on successful save', async () => {
            vi.mocked(mockApiClient.post).mockResolvedValue({ data: mockDialecticSession, status: 200 });

            const result = await dialecticApiClient.saveContributionEdit(validPayload);

            expect(result.data).toEqual(mockDialecticSession);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return an error object on failed save', async () => {
            const mockError: ApiError = { code: 'FORBIDDEN', message: 'Not authorized' };
            vi.mocked(mockApiClient.post).mockResolvedValue({ error: mockError, status: 403 });

            const result = await dialecticApiClient.saveContributionEdit(validPayload);

            expect(result.error).toEqual(mockError);
            expect(result.data).toBeUndefined();
        });
    });     
    
    describe('startSession', () => {
        const endpoint = 'dialectic-service';
        const validPayload: StartSessionPayload = {
            idempotencyKey: 'test-idem-session-1',
            projectId: 'proj-123',
            sessionDescription: 'Kicking off a new session',
            selectedModels: [
                mockSelectedModel({ id: 'model-abc', displayName: 'Model ABC' }),
                mockSelectedModel({ id: 'model-def', displayName: 'Model DEF' }),
            ],
        };
        const requestBody = { action: 'startSession', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and payload', async () => {
            const mockResponse: ApiResponse<DialecticSession> = {
                data: mockDialecticSession, // Assuming mockDialecticSession is suitable
                status: 201,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            await dialecticApiClient.startSession(validPayload);

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should include idempotencyKey in payload sent to post', async () => {
            vi.mocked(mockApiClient.post).mockResolvedValue({ data: mockDialecticSession, status: 201 });
            await dialecticApiClient.startSession(validPayload);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(
                endpoint,
                expect.objectContaining({ payload: expect.objectContaining({ idempotencyKey: validPayload.idempotencyKey }) })
            );
        });

        it('should return the created session data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticSession> = {
                data: mockDialecticSession,
                status: 201,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.data).toEqual(mockDialecticSession);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed session creation', async () => {
            const mockApiError: ApiError = { code: 'VALIDATION_ERROR', message: 'Invalid project ID' };
            const mockErrorResponse: ApiResponse<DialecticSession> = {
                error: mockApiError,
                status: 400,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(400);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            vi.mocked(mockApiClient.post).mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

    describe('submitStageResponses', () => {
        const endpoint = 'dialectic-service';
        const validPayload: SubmitStageResponsesPayload = {
            sessionId: 'sess-123',
            projectId: 'proj-123',
            stageSlug: 'synthesis',
            currentIterationNumber: 1,
        };

        const submitStageResponsesSession: DialecticSession = mockSession({
            id: 'sess-123',
            project_id: 'proj-123',
            session_description: 'Test Session',
            status: 'pending_parenthesis',
            current_stage_id: 'stage-456',
            viewing_stage_id: null,
        });

        it('should call apiClient.post with the correct action and payload', async () => {
            const expectedBody: DialecticServiceActionPayload = {
                action: 'submitStageResponses',
                payload: validPayload,
            };
            const mockResponseData: SubmitStageResponsesResponse = {
                updatedSession: submitStageResponsesSession,
                message: 'Stage advanced successfully.',
            };
            vi.mocked(mockApiClient.post).mockResolvedValue({ data: mockResponseData, status: 200 });

            await dialecticApiClient.submitStageResponses(validPayload);

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, expectedBody);
        });

        it('should return the updated session on successful stage advancement', async () => {
            const mockResponseData: SubmitStageResponsesResponse = {
                updatedSession: submitStageResponsesSession,
                message: 'Stage advanced successfully.',
            };
            vi.mocked(mockApiClient.post).mockResolvedValue({ data: mockResponseData, status: 200 });

            const result = await dialecticApiClient.submitStageResponses(validPayload);

            expect(result.data).toEqual(mockResponseData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return an error object on failed stage advancement', async () => {
            const mockError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to advance stage' };
            vi.mocked(mockApiClient.post).mockResolvedValue({ error: mockError, status: 500 });

            const result = await dialecticApiClient.submitStageResponses(validPayload);

            expect(result.error).toEqual(mockError);
            expect(result.data).toBeUndefined();
        });
    });
      
    describe('updateSessionModels', () => {
        const endpoint = 'dialectic-service';
        const validPayload: UpdateSessionModelsPayload = {
            sessionId: 'sess-123',
            selectedModels: [
                mockSelectedModel({ id: 'model-xyz', displayName: 'Model XYZ' }),
                mockSelectedModel({ id: 'model-abc', displayName: 'Model ABC' }),
            ],
        };
        const requestBody = { action: 'updateSessionModels', payload: validPayload };
        const mockUpdatedSession: DialecticSession = mockSession({
            id: validPayload.sessionId,
            project_id: 'proj-123',
            session_description: 'Test Session',
            status: 'pending_hypothesis',
            current_stage_id: 'stage-123',
            viewing_stage_id: null,
            selected_models: validPayload.selectedModels,
        });

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DialecticSession> = {
                data: mockUpdatedSession,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            await dialecticApiClient.updateSessionModels(validPayload);

            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(mockApiClient.post)).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the updated session data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticSession> = {
                data: mockUpdatedSession,
                status: 200,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.updateSessionModels(validPayload);

            expect(result.data).toEqual(mockUpdatedSession);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed update (e.g., session not found)', async () => {
            const mockApiError: ApiError = { code: 'NOT_FOUND', message: 'Session not found for model update' };
            const mockErrorResponse: ApiResponse<DialecticSession> = {
                error: mockApiError,
                status: 404,
            };
            vi.mocked(mockApiClient.post).mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.updateSessionModels(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for updateSessionModels';
            vi.mocked(mockApiClient.post).mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.updateSessionModels(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
        });
    });

}); 