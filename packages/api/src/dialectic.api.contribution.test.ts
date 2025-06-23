import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DialecticApiClient } from './dialectic.api';
import { ApiClient, ApiError as LocalApiError } from './apiClient';
import { 
    ApiResponse, 
    ApiError as ApiErrorType,
    CreateProjectPayload, 
    DialecticProject, 
    StartSessionPayload, 
    DialecticSession, 
    AIModelCatalogEntry, 
    ContributionContentSignedUrlResponse, 
    DialecticProjectResource, 
    DomainOverlayDescriptor, 
    UpdateProjectDomainPayload,
    DeleteProjectPayload,
    DialecticServiceActionPayload,
    GetContributionContentSignedUrlPayload,
    GetProjectResourceContentPayload,
    DialecticContribution,
    GenerateContributionsPayload,
    GenerateContributionsResponse,
    UpdateProjectInitialPromptPayload,
    SubmitStageResponsesPayload,
    SubmitStageResponsesResponse,
    SaveContributionEditPayload,
    GetIterationInitialPromptPayload,
    IterationInitialPromptData,
    GetProjectResourceContentResponse,
    DialecticDomain,
    DialecticProcessTemplate,
    DialecticStage,
    UpdateSessionModelsPayload,
    DomainDescriptor,
    GetContributionContentDataResponse,
} from '@paynless/types';

// Mock the base ApiClient
const mockApiClientPost = vi.fn();
const mockApiClient = {
    get: vi.fn(),
    post: mockApiClientPost,
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
} as unknown as ApiClient; 

// Create an instance of the class we are testing
const dialecticApiClient = new DialecticApiClient(mockApiClient);

// Mock data (ensure these align with current type definitions)
const mockDialecticProject: DialecticProject = {
  id: 'proj-123',
  user_id: 'user-abc',
  project_name: 'Test Project',
  initial_user_prompt: 'Test prompt',
  selected_domain_id: 'dom-1',
  dialectic_domains: { name: 'Software Development' },
  selected_domain_overlay_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  repo_url: null,
  status: 'active',
  dialectic_process_templates: null,
  isLoadingProcessTemplate: false,
  processTemplateError: null,
  contributionGenerationStatus: 'idle',
  generateContributionsError: null,
  isSubmittingStageResponses: false,
  submitStageResponsesError: null,
  isSavingContributionEdit: false,
  saveContributionEditError: null,
};

const mockDialecticSession: DialecticSession = {
  id: 'sess-456',
  project_id: 'proj-123',
  session_description: "Test Session",
  iteration_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: "pending_hypothesis",
  associated_chat_id: null,
  current_stage_id: 'stage-123',
  selected_model_catalog_ids: ['model-1'],
  user_input_reference_url: null,
};

// Remove any mock project data that incorrectly includes a 'sessions' array directly
// For example, if baseMockProject previously had a sessions property, remove it:
const baseMockProject: Omit<DialecticProject, 'user_id' | 'created_at' | 'updated_at' | 'id' | 'dialectic_domains' | 'dialectic_process_templates'> & Partial<Pick<DialecticProject, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & { dialectic_domains?: { name: string } | null, dialectic_process_templates?: DialecticProcessTemplate | null } = {
    project_name: "Test Project Base",
    initial_user_prompt: "Base prompt.",
    selected_domain_id: "dom-1",
    dialectic_domains: { name: 'Software Development' },
    selected_domain_overlay_id: null,
    repo_url: null,
    status: 'active',
    dialectic_process_templates: null,
    isLoadingProcessTemplate: false,
    processTemplateError: null,
    contributionGenerationStatus: 'idle',
    generateContributionsError: null,
    isSubmittingStageResponses: false,
    submitStageResponsesError: null,
    isSavingContributionEdit: false,
    saveContributionEditError: null,
};

describe('DialecticApiClient', () => {
    beforeEach(() => {
        vi.resetAllMocks(); // Reset mocks before each test
    });
   
    describe('generateContributions', () => {
        const endpoint = 'dialectic-service';
        const mockStageObject: DialecticStage = { id: 'stage-1', slug: 'thesis', display_name: 'Thesis', created_at: new Date().toISOString(), description: null, default_system_prompt_id: null, expected_output_artifacts: null, input_artifact_rules: null };
        const validPayload: GenerateContributionsPayload = {
            sessionId: 'sess-456',
            projectId: 'proj-123',
            stageSlug: mockStageObject.slug,
            iterationNumber: 1,
        };
        const requestBody = { action: 'generateContributions', payload: validPayload };

        const mockContribution: DialecticContribution = {
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
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            storage_bucket: 'dialectic-contributions',
            storage_path: `projects/${validPayload.projectId}/sessions/${validPayload.sessionId}/iteration_1/thesis/contrib-xyz.md`,
            mime_type: 'text/markdown',
            size_bytes: 1500,
            contribution_type: 'ai',
            file_name: 'contrib-xyz.md',
        };

        const mockSuccessResponse: GenerateContributionsResponse = {
            message: 'Contributions generated successfully for thesis stage.',
            contributions: [mockContribution],
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const apiResponse: ApiResponse<GenerateContributionsResponse> = {
                data: mockSuccessResponse,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(apiResponse);

            await dialecticApiClient.generateContributions(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the generation response on successful execution', async () => {
            const apiResponse: ApiResponse<GenerateContributionsResponse> = {
                data: mockSuccessResponse,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(apiResponse);

            const result = await dialecticApiClient.generateContributions(validPayload);

            expect(result.data).toEqual(mockSuccessResponse);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed generation (e.g., session not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Session not found or generation failed' };
            const mockErrorResponse: ApiResponse<GenerateContributionsResponse> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.generateContributions(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for generateContributions';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.generateContributions(validPayload);

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
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
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.getContributionContentData(contributionId);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the contribution content data on successful fetch', async () => {
            const mockResponse: ApiResponse<GetContributionContentDataResponse | null> = {
                data: mockContentDataResponse,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

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
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getContributionContentData(contributionId);

            expect(result.data).toBeNull();
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on other API failures', async () => {
            const mockApiError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to fetch content data' };
            const mockErrorResponse: ApiResponse<GetContributionContentDataResponse | null> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getContributionContentData(contributionId);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for getContributionContentData';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

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
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.getIterationInitialPromptContent(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the iteration initial prompt data on successful response', async () => {
            const mockResponse: ApiResponse<IterationInitialPromptData> = {
                data: mockPromptData,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.getIterationInitialPromptContent(validPayload);

            expect(result.data).toEqual(mockPromptData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed fetch (e.g., prompt not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Initial prompt for iteration not found' };
            const mockErrorResponse: ApiResponse<IterationInitialPromptData> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.getIterationInitialPromptContent(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for getIterationInitialPromptContent';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

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

        const mockModelCatalogEntry: AIModelCatalogEntry = {
            id: 'model-cat-123',
            provider_name: 'OpenAI',
            model_name: 'GPT-4',
            api_identifier: 'gpt-4',
            description: 'Powerful model by OpenAI',
            strengths: ['coding', 'writing'],
            weaknesses: ['cost'],
            context_window_tokens: 8192,
            input_token_cost_usd_millionths: 30,
            output_token_cost_usd_millionths: 60,
            max_output_tokens: 4096,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<AIModelCatalogEntry[]> = {
                data: [mockModelCatalogEntry],
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.listModelCatalog();

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the model catalog array on successful response', async () => {
            const mockCatalogData: AIModelCatalogEntry[] = [mockModelCatalogEntry];
            const mockResponse: ApiResponse<AIModelCatalogEntry[]> = {
                data: mockCatalogData,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.data).toEqual(mockCatalogData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed response', async () => {
            const mockApiError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to fetch model catalog' };
            const mockErrorResponse: ApiResponse<AIModelCatalogEntry[]> = {
                error: mockApiError,
                status: 500,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(500);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for listModelCatalog';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

            const result = await dialecticApiClient.listModelCatalog();

            expect(result.error).toEqual({
                code: 'NETWORK_ERROR',
                message: networkErrorMessage,
            });
            expect(result.status).toBe(0);
            expect(result.data).toBeUndefined();
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
        };
        const requestBody = { action: 'saveContributionEdit', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and payload', async () => {
            const expectedBody: DialecticServiceActionPayload = {
                action: 'saveContributionEdit',
                payload: validPayload
            };
            mockApiClientPost.mockResolvedValue({ data: mockDialecticSession, status: 200 });

            await dialecticApiClient.saveContributionEdit(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, expectedBody);
        });

        it('should return the updated contribution on successful save', async () => {
            mockApiClientPost.mockResolvedValue({ data: mockDialecticSession, status: 200 });

            const result = await dialecticApiClient.saveContributionEdit(validPayload);

            expect(result.data).toEqual(mockDialecticSession);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return an error object on failed save', async () => {
            const mockError: ApiErrorType = { code: 'FORBIDDEN', message: 'Not authorized' };
            mockApiClientPost.mockResolvedValue({ error: mockError, status: 403 });

            const result = await dialecticApiClient.saveContributionEdit(validPayload);

            expect(result.error).toEqual(mockError);
            expect(result.data).toBeUndefined();
        });
    });     
    
    describe('startSession', () => {
        const endpoint = 'dialectic-service';
        const validPayload: StartSessionPayload = {
            projectId: 'proj-123',
            sessionDescription: 'Kicking off a new session',
            selectedModelCatalogIds: ['model-abc', 'model-def'],
        };
        const requestBody = { action: 'startSession', payload: validPayload };

        it('should call apiClient.post with the correct endpoint and payload', async () => {
            const mockResponse: ApiResponse<DialecticSession> = {
                data: mockDialecticSession, // Assuming mockDialecticSession is suitable
                status: 201,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.startSession(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the created session data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticSession> = {
                data: mockDialecticSession,
                status: 201,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.data).toEqual(mockDialecticSession);
            expect(result.status).toBe(201);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed session creation', async () => {
            const mockApiError: ApiErrorType = { code: 'VALIDATION_ERROR', message: 'Invalid project ID' };
            const mockErrorResponse: ApiResponse<DialecticSession> = {
                error: mockApiError,
                status: 400,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.startSession(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(400);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

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
        const mockStageObject: DialecticStage = { id: 'stage-1', slug: 'thesis', display_name: 'Thesis', created_at: new Date().toISOString(), description: null, default_system_prompt_id: null, expected_output_artifacts: null, input_artifact_rules: null };
        
        // Original validPayload without userStageFeedback
        const validPayloadWithoutFeedback: SubmitStageResponsesPayload = {
            sessionId: 'sess-123',
            projectId: 'proj-123',
            stageSlug: mockStageObject.slug,
            currentIterationNumber: 1,
            responses: [{ originalContributionId: 'contrib-abc', responseText: 'This is a great point.' }]
        };

        // New validPayload with userStageFeedback
        const validPayloadWithFeedback: SubmitStageResponsesPayload = {
            sessionId: 'sess-456',
            projectId: 'proj-789',
            stageSlug: mockStageObject.slug,
            currentIterationNumber: 2,
            responses: [{ originalContributionId: 'contrib-def', responseText: 'Interesting idea.' }],
            userStageFeedback: {
                content: "This is the overall feedback for the stage.",
                feedbackType: "StageReviewSummary_v1",
                resourceDescription: { summary: "Positive feedback" }
            }
        };

        it('should call apiClient.post with the correct endpoint and body when userStageFeedback IS provided', async () => {
            const expectedBody: DialecticServiceActionPayload = {
                action: 'submitStageResponses',
                payload: validPayloadWithFeedback // Use the payload with feedback
            };
            // Assuming mockDialecticSession is a suitable response type for SubmitStageResponsesResponse
            // The plan indicates SubmitStageResponsesResponse includes userFeedbackStoragePath, nextStageSeedPromptStoragePath, updatedSession
            // For now, we'll keep mockDialecticSession for the data part of the response if it aligns with updatedSession.
            // A more specific mockSubmitStageResponsesResponse might be needed later if tests become more granular.
            const mockResponseData: SubmitStageResponsesResponse = {
                userFeedbackStoragePath: 'path/to/feedback.md',
                nextStageSeedPromptStoragePath: 'path/to/next_seed.md',
                updatedSession: mockDialecticSession, // Assuming mockDialecticSession is a valid DialecticSession
                message: 'Responses submitted successfully'
            };
            mockApiClientPost.mockResolvedValue({ data: mockResponseData, status: 200 });

            await dialecticApiClient.submitStageResponses(validPayloadWithFeedback);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, expectedBody);
        });
        
        it('should call apiClient.post with the correct endpoint and body when userStageFeedback is NOT provided', async () => {
            const expectedBody: DialecticServiceActionPayload = {
                action: 'submitStageResponses',
                payload: validPayloadWithoutFeedback // Use the payload without feedback
            };
            const mockResponseData: SubmitStageResponsesResponse = {
                userFeedbackStoragePath: 'path/to/feedback_alt.md', // Different path for clarity
                nextStageSeedPromptStoragePath: 'path/to/next_seed_alt.md',
                updatedSession: mockDialecticSession,
                message: 'Responses submitted (no feedback file)'
            };
            mockApiClientPost.mockResolvedValue({ data: mockResponseData, status: 200 });

            await dialecticApiClient.submitStageResponses(validPayloadWithoutFeedback);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, expectedBody);
        });

        it('should return the success response on successful submission (with feedback)', async () => {
            const mockResponseData: SubmitStageResponsesResponse = {
                userFeedbackStoragePath: 'path/to/feedback.md',
                nextStageSeedPromptStoragePath: 'path/to/next_seed.md',
                updatedSession: mockDialecticSession,
                message: 'Submission successful'
            };
            mockApiClientPost.mockResolvedValue({ data: mockResponseData, status: 200 });

            const result = await dialecticApiClient.submitStageResponses(validPayloadWithFeedback);

            expect(result.data).toEqual(mockResponseData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the success response on successful submission (without feedback)', async () => {
            const mockResponseData: SubmitStageResponsesResponse = {
                userFeedbackStoragePath: 'path/to/feedback_alt.md',
                nextStageSeedPromptStoragePath: 'path/to/next_seed_alt.md',
                updatedSession: mockDialecticSession,
                message: 'Submission successful (no feedback file)'
            };
            mockApiClientPost.mockResolvedValue({ data: mockResponseData, status: 200 });

            const result = await dialecticApiClient.submitStageResponses(validPayloadWithoutFeedback);

            expect(result.data).toEqual(mockResponseData);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return an error object on failed submission', async () => {
            const mockError: ApiErrorType = { code: 'SERVER_ERROR', message: 'Failed to submit' };
            mockApiClientPost.mockResolvedValue({ error: mockError, status: 500 });

            const result = await dialecticApiClient.submitStageResponses(validPayloadWithFeedback); // Can use either payload here

            expect(result.error).toEqual(mockError);
            expect(result.data).toBeUndefined();
        });
    });
      
    describe('updateSessionModels', () => {
        const endpoint = 'dialectic-service';
        const validPayload: UpdateSessionModelsPayload = {
            sessionId: 'sess-123',
            selectedModelCatalogIds: ['model-xyz', 'model-abc'],
        };
        const requestBody = { action: 'updateSessionModels', payload: validPayload };
        const mockUpdatedSession: DialecticSession = {
            ...mockDialecticSession, // Assuming mockDialecticSession is a base session
            id: validPayload.sessionId,
            selected_model_catalog_ids: validPayload.selectedModelCatalogIds,
            updated_at: new Date().toISOString(),
        };

        it('should call apiClient.post with the correct endpoint and body', async () => {
            const mockResponse: ApiResponse<DialecticSession> = {
                data: mockUpdatedSession,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            await dialecticApiClient.updateSessionModels(validPayload);

            expect(mockApiClientPost).toHaveBeenCalledTimes(1);
            expect(mockApiClientPost).toHaveBeenCalledWith(endpoint, requestBody);
        });

        it('should return the updated session data on successful response', async () => {
            const mockResponse: ApiResponse<DialecticSession> = {
                data: mockUpdatedSession,
                status: 200,
            };
            mockApiClientPost.mockResolvedValue(mockResponse);

            const result = await dialecticApiClient.updateSessionModels(validPayload);

            expect(result.data).toEqual(mockUpdatedSession);
            expect(result.status).toBe(200);
            expect(result.error).toBeUndefined();
        });

        it('should return the error object on failed update (e.g., session not found)', async () => {
            const mockApiError: ApiErrorType = { code: 'NOT_FOUND', message: 'Session not found for model update' };
            const mockErrorResponse: ApiResponse<DialecticSession> = {
                error: mockApiError,
                status: 404,
            };
            mockApiClientPost.mockResolvedValue(mockErrorResponse);

            const result = await dialecticApiClient.updateSessionModels(validPayload);

            expect(result.error).toEqual(mockApiError);
            expect(result.status).toBe(404);
            expect(result.data).toBeUndefined();
        });

        it('should return a network error if apiClient.post rejects', async () => {
            const networkErrorMessage = 'Simulated network failure for updateSessionModels';
            mockApiClientPost.mockRejectedValueOnce(new Error(networkErrorMessage));

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