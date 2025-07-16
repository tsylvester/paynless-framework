import { 
    describe, 
    it, 
    expect, 
    beforeEach, 
    afterEach, 
    vi,
    type Mock
} from 'vitest';
import { 
    useDialecticStore, 
    initialDialecticStateValues 
} from './dialecticStore';
import type { 
  ApiError, 
  ApiResponse, 
  DialecticProject, 
  CreateProjectPayload,
  ContributionContentSignedUrlResponse,
  AIModelCatalogEntry,
  DialecticSession,
  StartSessionPayload,
  DomainOverlayDescriptor,
  DomainDescriptor,
  DialecticContribution,
  SubmitStageResponsesPayload,
  SubmitStageResponsesResponse,
  SaveContributionEditPayload,
  GenerateContributionsResponse,
  GenerateContributionsPayload,
  IterationInitialPromptData,
  DialecticStage,
} from '@paynless/types';

// We need to import the mock api object and helpers to use in the test
import { 
    api,
    resetApiMock,
} from '@paynless/api/mocks';

vi.mock('@paynless/api', async (importOriginal) => {
    const original = await importOriginal() as Record<string, unknown>;
    const { api } = await import('@paynless/api/mocks'); 
    return {
        ...original,
        api: vi.mocked(api, true), // Use deep mocking
        initializeApiClient: vi.fn(), 
    };
});

describe('useDialecticStore', () => {
    beforeEach(() => {
        resetApiMock();
        useDialecticStore.getState()._resetForTesting?.();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockModelCatalog: AIModelCatalogEntry[] = [
        { id: 'model-1', model_name: 'Test Model 1', provider_name: 'Provider A', api_identifier: 'm1', created_at: '', updated_at: '', context_window_tokens: 1000, input_token_cost_usd_millionths: 1, output_token_cost_usd_millionths: 1, max_output_tokens: 500, is_active: true, description: null, strengths: null, weaknesses: null },
        { id: 'model-2', model_name: 'Test Model 2', provider_name: 'Provider B', api_identifier: 'm2', created_at: '', updated_at: '', context_window_tokens: 1000, input_token_cost_usd_millionths: 1, output_token_cost_usd_millionths: 1, max_output_tokens: 500, is_active: true, description: null, strengths: null, weaknesses: null },
    ];

    describe('fetchContributionContent action', () => {
        const testContributionId = 'contrib-123';
        const mockContentData = {
            content: 'This is the test content.',
            mimeType: 'text/markdown',
            sizeBytes: 123,
            fileName: 'test.md',
        };
        const mockApiError: ApiError = { message: 'API Failed', code: 'API_ERROR' };

        it('should fetch content data and update cache if not cached', async () => {
            api.dialectic().getContributionContentData.mockResolvedValue({
                data: mockContentData,
                status: 200,
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];

            expect(api.dialectic().getContributionContentData).toHaveBeenCalledWith(testContributionId);
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.content).toBe(mockContentData.content);
            expect(cacheEntry.mimeType).toBe(mockContentData.mimeType);
            expect(cacheEntry.sizeBytes).toBe(mockContentData.sizeBytes);
            expect(cacheEntry.fileName).toBe(mockContentData.fileName);
            expect(cacheEntry.error).toBeNull();
        });

        it('should use cached content if already available and not errored', async () => {
            useDialecticStore.setState({
                contributionContentCache: {
                    [testContributionId]: {
                        content: mockContentData.content,
                        mimeType: mockContentData.mimeType,
                        sizeBytes: mockContentData.sizeBytes,
                        fileName: mockContentData.fileName,
                        isLoading: false,
                        error: null,
                    }
                }
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            expect(api.dialectic().getContributionContentData).not.toHaveBeenCalled();
            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];
            expect(cacheEntry.content).toBe(mockContentData.content);
            expect(cacheEntry.isLoading).toBe(false); // Should remain false or be set to false
        });

        it('should still set isLoading to false if content was in cache but isLoading was true initially', async () => {
            // This scenario covers if a fetch was initiated, component unmounted, then re-mounted
            // and fetchContributionContent is called again while content is now there.
            useDialecticStore.setState({
                contributionContentCache: {
                    [testContributionId]: {
                        content: mockContentData.content,
                        mimeType: mockContentData.mimeType,
                        sizeBytes: mockContentData.sizeBytes,
                        fileName: mockContentData.fileName,
                        isLoading: true, // Simulate it was loading
                        error: null,
                    }
                }
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);
            expect(api.dialectic().getContributionContentData).not.toHaveBeenCalled();
            const state = useDialecticStore.getState();
            expect(state.contributionContentCache[testContributionId].isLoading).toBe(false);
        });
        
        it('should handle API error when fetching content data', async () => {
            api.dialectic().getContributionContentData.mockResolvedValue({
                error: mockApiError,
                status: 500,
                data: undefined,
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.error).toEqual(mockApiError);
            expect(cacheEntry.content).toBeUndefined();
        });

        it('should handle API error when fetching content data (no data returned)', async () => {
            api.dialectic().getContributionContentData.mockResolvedValue({
                data: null, // No data
                status: 200, // But status is OK
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.error).toEqual({
                message: 'Failed to fetch contribution content, no data returned.',
                code: 'NO_DATA_RETURNED',
            });
            expect(cacheEntry.content).toBeUndefined();
        });

        it('should handle network error when fetching content data', async () => {
            const networkError = new Error('Network Failure');
            api.dialectic().getContributionContentData.mockRejectedValue(networkError);

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.error).toEqual({
                message: networkError.message,
                code: 'NETWORK_ERROR',
            });
            expect(cacheEntry.content).toBeUndefined();
        });

        it('should set isLoading correctly during operations', async () => {
            let checkedLoading = false;
            api.dialectic().getContributionContentData.mockImplementation(async () => {
                // Check state while API call is in progress
                expect(useDialecticStore.getState().contributionContentCache[testContributionId]?.isLoading).toBe(true);
                checkedLoading = true;
                return { data: mockContentData, status: 200 };
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            expect(checkedLoading).toBe(true);
            expect(useDialecticStore.getState().contributionContentCache[testContributionId]?.isLoading).toBe(false);
        });
    });

    describe('generateContributions thunk', () => {
        const mockPayload: GenerateContributionsPayload = {
            sessionId: 'sess-generate-123',
            projectId: 'proj-generate-abc',
            iterationNumber: 1,
            stageSlug: 'thesis',
            continueUntilComplete: true,
        };

        const mockProject: DialecticProject = {
            id: mockPayload.projectId,
            project_name: 'Test Project for Generation',
            user_id: 'user-123',
            selected_domain_id: 'domain-1',
            dialectic_domains: { name: 'Test Domain' },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'active',
            dialectic_sessions: [{
                id: mockPayload.sessionId,
                project_id: mockPayload.projectId,
                iteration_count: 1,
                session_description: 'A session for testing generation',
                selected_model_ids: ['model-1', 'model-2'],
                dialectic_contributions: [],
                status: 'active',
                user_input_reference_url: null,
                associated_chat_id: null,
                current_stage_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }],
            contributionGenerationStatus: 'idle',
            generateContributionsError: null,
            isSubmittingStageResponses: false,
            submitStageResponsesError: null,
            isSavingContributionEdit: false,
            saveContributionEditError: null,
            initial_user_prompt: 'initial prompt',
            initial_prompt_resource_id: null,
            selected_domain_overlay_id: null,
            repo_url: null,
            process_template_id: null,
            dialectic_process_templates: null,
            isLoadingProcessTemplate: false,
            processTemplateError: null,
        };

        const mockApiError: ApiError = { message: 'API Failed', code: 'VALIDATION_ERROR' };
        const networkError = new Error('Network Failure');

        beforeEach(() => {
            useDialecticStore.setState({
                currentProjectDetail: JSON.parse(JSON.stringify(mockProject)),
                selectedModelIds: ['model-1', 'model-2'],
                modelCatalog: mockModelCatalog,
                generatingSessions: {},
            });
        });

        it('should create placeholders and store job IDs on 202 Accepted', async () => {
            const mockSuccessResponse: GenerateContributionsResponse = {
                sessionId: mockPayload.sessionId,
                projectId: mockPayload.projectId,
                stage: mockPayload.stageSlug,
                iteration: mockPayload.iterationNumber,
                status: 'pending',
                job_ids: ['job-id-1', 'job-id-2'],
                successfulContributions: [],
                failedAttempts: [],
            };
            (api.dialectic().generateContributions as Mock).mockResolvedValue({
                data: mockSuccessResponse,
                status: 202,
            });
            
            const { generateContributions } = useDialecticStore.getState();
            await generateContributions(mockPayload);
            
            const state = useDialecticStore.getState();
            const contributions = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;

            expect(state.contributionGenerationStatus).toBe('generating');
            expect(contributions).toHaveLength(2);
            expect(contributions?.[0].status).toBe('pending');
            expect(state.generatingSessions[mockPayload.sessionId]).toEqual(['job-id-1', 'job-id-2']);
        });

        it('should set error state and mark placeholders as failed if API returns an error', async () => {
            (api.dialectic().generateContributions as Mock).mockResolvedValue({
                error: mockApiError,
                status: 500,
            });

            const { generateContributions } = useDialecticStore.getState();
            await generateContributions(mockPayload);

            const state = useDialecticStore.getState();
            const contributions = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;

            expect(state.contributionGenerationStatus).toBe('failed');
            expect(state.generateContributionsError).toEqual(mockApiError);
            expect(contributions).toHaveLength(2);
            expect(contributions?.[0].status).toBe('failed');
        });

        it('should set network error state and mark placeholders as failed if API call throws', async () => {
            (api.dialectic().generateContributions as Mock).mockRejectedValue(networkError);
            
            const { generateContributions } = useDialecticStore.getState();
            await generateContributions(mockPayload);

            const state = useDialecticStore.getState();
            const contributions = state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
            const expectedError = { message: networkError.message, code: 'NETWORK_ERROR' };

            expect(state.contributionGenerationStatus).toBe('failed');
            expect(state.generateContributionsError).toEqual(expectedError);
            expect(contributions).toHaveLength(2);
            expect(contributions?.[0].status).toBe('failed');
        });

        it('should correctly cycle through contributionGenerationStatus states', async () => {
            const mockSuccessResponse: GenerateContributionsResponse = {
                job_ids: ['job-id-1', 'job-id-2'],
            };
            const mockApiResponse: ApiResponse<GenerateContributionsResponse> = {
                data: mockSuccessResponse,
                status: 202,
            };
            (api.dialectic().generateContributions as Mock).mockResolvedValue(mockApiResponse);

            const { generateContributions } = useDialecticStore.getState();

            // Check initial state
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('idle');

            // Trigger the action
            const resultPromise = generateContributions(mockPayload);

            // Check intermediate state
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');

            await resultPromise;

            // Final state should still be 'generating' as it's waiting for websocket events
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');
        });
    });

    // New test suite for submitStageResponses
    describe('submitStageResponses thunk', () => {
        let mockInitialProjectState: DialecticProject;
        const mockProjectId = 'proj-submit-123';
        const mockSessionId = 'sess-submit-456';
        const mockStageSlug = 'thesis';
        const mockIteration = 1;

        const mockPayloadWithoutFeedback: SubmitStageResponsesPayload = {
            projectId: mockProjectId,
            sessionId: mockSessionId,
            stageSlug: mockStageSlug,
            currentIterationNumber: mockIteration,
            responses: [{ originalContributionId: 'contrib-model-A', responseText: 'Feedback for A' }],
        };

        const validUserStageFeedback: SubmitStageResponsesPayload['userStageFeedback'] = {
            content: 'This is great feedback!',
            feedbackType: 'file_upload',
            resourceDescription: { fileName: 'feedback.txt', fileSize: 1024 }
        };

        const mockPayloadWithFeedback: SubmitStageResponsesPayload = {
            ...mockPayloadWithoutFeedback,
            userStageFeedback: validUserStageFeedback,
        };
        
        const mockProjectForRefetch: DialecticProject = {
            id: mockProjectId,
            project_name: 'Test Project for Submission Refetched',
            status: 'active',
            initial_user_prompt: 'An initial prompt',
            selected_domain_overlay_id: null,
            repo_url: null,
            user_id: 'user-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dialectic_sessions: [{ 
                id: mockSessionId, 
                status: 'pending_antithesis', // Example updated status
                project_id: mockProjectId,
                session_description: 'A session',
                current_stage_id: 'thesis',
                iteration_count: 1,
                dialectic_contributions: [],
                associated_chat_id: null,
                user_input_reference_url: null,
                selected_model_ids: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }],
            dialectic_domains: { name: 'Test Domain' },
            dialectic_process_templates: null,
            process_template_id: 'pt-1',
            isLoadingProcessTemplate: false,
            processTemplateError: null,
            contributionGenerationStatus: 'idle',
            generateContributionsError: null,
            selected_domain_id: 'domain-1',
            isSubmittingStageResponses: false,
            submitStageResponsesError: null,
            isSavingContributionEdit: false,
            saveContributionEditError: null,
        };

        const mockSuccessBaseResponse: Omit<SubmitStageResponsesResponse, 'userFeedbackStoragePath'> = {
            nextStageSeedPromptStoragePath: 'path/to/next_seed.md',
            updatedSession: { ...(mockProjectForRefetch.dialectic_sessions && mockProjectForRefetch.dialectic_sessions[0]), current_iteration: 2 } as DialecticSession,
            message: 'Successfully submitted and prepared next seed.',
        };
        
        const mockSuccessResponseWithFeedback: SubmitStageResponsesResponse = {
            ...mockSuccessBaseResponse,
            userFeedbackStoragePath: 'path/to/user_feedback.json', 
        };

        const mockSuccessResponseWithoutFeedback: SubmitStageResponsesResponse = {
            ...mockSuccessBaseResponse,
            userFeedbackStoragePath: 'path/to/user_feedback.json', 
        };

        beforeEach(() => {
            mockInitialProjectState = JSON.parse(JSON.stringify(mockProjectForRefetch));
            useDialecticStore.setState({
                currentProjectDetail: mockInitialProjectState,
                selectedModelIds: ['model-1', 'model-2'],
                modelCatalog: mockModelCatalog,
                generatingSessions: {},
            });
        });

        describe('successful submission', () => {
            it('with user feedback: should set loading state, call API, refetch project details, and show success', async () => {
                api.dialectic().submitStageResponses.mockResolvedValueOnce({
                    data: mockSuccessResponseWithFeedback,
                    status: 200,
                });
                api.dialectic().getProjectDetails.mockResolvedValueOnce({
                    data: mockProjectForRefetch,
                    status: 200,
                });
    
                const { submitStageResponses } = useDialecticStore.getState();
                const result = await submitStageResponses(mockPayloadWithFeedback);
    
                expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
                expect(useDialecticStore.getState().submitStageResponsesError).toBeNull();
                expect(api.dialectic().submitStageResponses).toHaveBeenCalledWith(mockPayloadWithFeedback);
                expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(mockProjectId);
                expect(useDialecticStore.getState().currentProjectDetail?.id).toEqual(mockProjectForRefetch.id);
                expect(result?.data).toEqual(mockSuccessResponseWithFeedback);
            });

            it('without user feedback: should set loading state, call API, refetch project details, and show success', async () => {
                api.dialectic().submitStageResponses.mockResolvedValueOnce({
                    data: mockSuccessResponseWithoutFeedback,
                    status: 200,
                });
                api.dialectic().getProjectDetails.mockResolvedValueOnce({
                    data: mockProjectForRefetch,
                    status: 200,
                });
    
                const { submitStageResponses } = useDialecticStore.getState();
                const result = await submitStageResponses(mockPayloadWithoutFeedback);
    
                expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
                expect(useDialecticStore.getState().submitStageResponsesError).toBeNull();
                expect(api.dialectic().submitStageResponses).toHaveBeenCalledWith(mockPayloadWithoutFeedback);
                expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(mockProjectId);
                expect(useDialecticStore.getState().currentProjectDetail?.id).toEqual(mockProjectForRefetch.id);
                expect(result?.data).toEqual(mockSuccessResponseWithoutFeedback);
            });
        });

        describe('failed submission', () => {
            it('should set error state on API error (when submitting with feedback)', async () => {
                const apiError: ApiError = { code: 'SUBMISSION_FAILED', message: 'Failed to submit responses.' };
                api.dialectic().submitStageResponses.mockResolvedValue({ error: apiError, status: 500 });
            
                const { submitStageResponses } = useDialecticStore.getState();
                const result = await submitStageResponses(mockPayloadWithFeedback); // Using withFeedback for this test
            
                expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
                expect(useDialecticStore.getState().submitStageResponsesError).toEqual(apiError);
                expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
                expect(result?.error).toEqual(apiError);
            });
            
            it('should set network error state if API call throws (when submitting with feedback)', async () => {
                const networkErrorMessage = 'Network connection failed for submission';
                api.dialectic().submitStageResponses.mockRejectedValue(new Error(networkErrorMessage));
            
                const { submitStageResponses } = useDialecticStore.getState();
                const result = await submitStageResponses(mockPayloadWithFeedback); // Using withFeedback for this test
            
                expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
                const expectedError: ApiError = { message: networkErrorMessage, code: 'NETWORK_ERROR' };
                expect(useDialecticStore.getState().submitStageResponsesError).toEqual(expectedError);
                expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
                expect(result?.error).toEqual(expectedError);
            });
        });
    });

    // New test suite for saveContributionEdit
    describe('saveContributionEdit thunk', () => {
        const mockProjectId = 'proj-edit-1';
        const mockSessionId = 'sess-edit-1';
        const originalContributionId = 'contrib-edit-original';

        // Correctly structured payload
        const mockPayload: SaveContributionEditPayload = {
            projectId: mockProjectId,
            sessionId: mockSessionId,
            originalContributionIdToEdit: originalContributionId,
            editedContentText: 'This is the new, edited content.',
            originalModelContributionId: originalContributionId, // This may be redundant depending on backend, but include for type correctness
            responseText: 'User feedback on the edit.'
        };

        const mockApiResponse: ApiResponse<DialecticContribution> = {
            status: 200,
            data: {
                id: 'contrib-edit-new-version',
                session_id: mockSessionId,
                original_model_contribution_id: originalContributionId,
                content: 'This is the new, edited content.',
            } as DialecticContribution,
        };

        const originalContribution: DialecticContribution = {
            id: originalContributionId,
            session_id: mockSessionId,
            content: 'Original content',
        } as DialecticContribution;

        const initialProjectState: DialecticProject = {
            id: mockProjectId,
            dialectic_sessions: [{
                id: mockSessionId,
                dialectic_contributions: [originalContribution],
            } as DialecticSession],
        } as DialecticProject;
        
        beforeEach(() => {
            // Reset mocks before each test
            resetApiMock();
            api.dialectic().saveContributionEdit.mockResolvedValue(mockApiResponse);
        });

        it('should update the contribution within the current project details without a refetch', async () => {
            useDialecticStore.setState({ currentProjectDetail: initialProjectState });

            const { saveContributionEdit } = useDialecticStore.getState();
            await saveContributionEdit(mockPayload);

            const finalState = useDialecticStore.getState();
            const session = finalState.currentProjectDetail?.dialectic_sessions?.find(s => s.id === mockSessionId);
            // The contribution with the *original* ID should now be gone
            const oldContribution = session?.dialectic_contributions?.find(c => c.id === originalContributionId);
            // The contribution with the *new* ID should be present
            const newContribution = session?.dialectic_contributions?.find(c => c.id === mockApiResponse.data!.id);

            expect(oldContribution).toBeUndefined();
            expect(newContribution).toBeDefined();
            expect(newContribution).toEqual(mockApiResponse.data);
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
        });
        
        it('should set an error if the API call fails', async () => {
            const mockError: ApiError = { code: 'SAVE_ERROR', message: 'Could not save' };
            api.dialectic().saveContributionEdit.mockResolvedValue({ error: mockError, status: 500 });

            const { saveContributionEdit } = useDialecticStore.getState();
            const result = await saveContributionEdit(mockPayload);

            expect(result.error).toEqual(mockError);
            const finalState = useDialecticStore.getState();
            expect(finalState.isSavingContributionEdit).toBe(false);
            expect(finalState.saveContributionEditError).toEqual(mockError);
        });
    });
});

// Helper to reset store state for testing (already part of DialecticActions in the actual store)
// Ensure this matches the actual _resetForTesting if defined in the store, or remove if not used.
// For this test file, useDialecticStore.getState()._resetForTesting?.() is preferred.
const resetStoreForTest = () => {
    useDialecticStore.setState(useDialecticStore.getState()._resetForTesting ? {} : {}); // A bit of a hack if _reset is not there
};
