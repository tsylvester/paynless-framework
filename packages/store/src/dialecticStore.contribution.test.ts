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
        };

        const mockSuccessResponse: GenerateContributionsResponse = {
            message: 'Contributions generated successfully for thesis stage.',
        };

        const mockProjectDetailsAfterGeneration: DialecticProject = {
            id: 'proj-generate-abc',
            project_name: 'Generated Project',
            user_id: 'user-test',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'active',
            initial_user_prompt: 'Initial',
            selected_domain_id: 'domain-1',
            dialectic_domains: { name: 'Test Domain' }, 
            selected_domain_overlay_id: null,
            repo_url: null,
            dialectic_process_templates: null, 
            process_template_id: 'pt-1',
            dialectic_sessions: [
                { 
                    id: 'sess-generate-123', 
                    project_id: 'proj-generate-abc',
                    session_description: 'Test session',
                    current_stage_id: 'thesis-stage-id',
                    iteration_count: 1,
                    current_iteration: 1,
                    dialectic_contributions: [{ id: 'new-contrib-1' } as DialecticContribution],
                    selected_model_catalog_ids: [],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    associated_chat_id: null,
                    user_input_reference_url: null,
                     status: 'pending_antithesis',
                } as DialecticSession,
            ],
            isLoadingProcessTemplate: false,
            processTemplateError: null,
            contributionGenerationStatus: 'idle', 
            generateContributionsError: null,
            isSubmittingStageResponses: false,
            submitStageResponsesError: null,
            isSavingContributionEdit: false,
            saveContributionEditError: null,
        };

        const mockApiError: ApiError = { code: 'GENERATION_FAILED', message: 'Failed to generate' };
        const networkError = new Error('Network failure');

        beforeEach(() => {
            // Ensure timers are faked for tests that might rely on setImmediate or setTimeout behavior in the store
             vi.useFakeTimers();
        });

        afterEach(() => {
            vi.runOnlyPendingTimers();
            vi.useRealTimers();
        });

        it('should call API, update status, and refresh project details on success', async () => {
            api.dialectic().generateContributions.mockResolvedValue({
                data: mockSuccessResponse,
                status: 200,
            });
            api.dialectic().getProjectDetails.mockResolvedValue({
                data: mockProjectDetailsAfterGeneration,
                status: 200,
            });
            api.dialectic().fetchProcessTemplate.mockResolvedValue({
                data: { id: 'pt-1', name: 'Test Template', stages: [], starting_stage_id: 's1' } as any,
                status: 200
            });

            const { generateContributions } = useDialecticStore.getState();
            
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('idle');

            const promise = generateContributions(mockPayload);
            
            // Immediately after call, status should be 'generating'
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');
            
            const result = await promise;

            expect(api.dialectic().generateContributions).toHaveBeenCalledWith(mockPayload);
            const state = useDialecticStore.getState();
            expect(state.contributionGenerationStatus).toBe('idle'); 
            expect(state.generateContributionsError).toBeNull();
            expect(result.data).toEqual(mockSuccessResponse);
            expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(mockPayload.projectId);
            expect(state.currentProjectDetail?.id).toBe(mockProjectDetailsAfterGeneration.id);
        });

        it('should set error state if API returns an error', async () => {
            api.dialectic().generateContributions.mockResolvedValue({
                error: mockApiError,
                status: 500,
                data: undefined, // ensure data is explicitly undefined or null for error responses
            });

            const { generateContributions } = useDialecticStore.getState();
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('idle');
            
            const resultPromise = generateContributions(mockPayload);
            
            // Immediately after call, status should be 'generating'
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');

            const result = await resultPromise;

            const state = useDialecticStore.getState();
            expect(state.contributionGenerationStatus).toBe('failed');
            expect(state.generateContributionsError).toEqual(mockApiError);
            expect(result.error).toEqual(mockApiError);
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
        });

        it('should set network error state if API call throws', async () => {
            api.dialectic().generateContributions.mockRejectedValue(networkError);

            const { generateContributions } = useDialecticStore.getState();
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('idle');
            
            const resultPromise = generateContributions(mockPayload);

            // Immediately after call, status should be 'generating'
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');
            
            const result = await resultPromise;

            const state = useDialecticStore.getState();
            expect(state.contributionGenerationStatus).toBe('failed');
            expect(state.generateContributionsError).toEqual({ message: networkError.message, code: 'NETWORK_ERROR' });
            expect(result.error).toEqual({ message: networkError.message, code: 'NETWORK_ERROR' });
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
        });

        it('should set contributionGenerationStatus through generating > idle/failed path', async () => {
            let resolveGeneration: (value: ApiResponse<GenerateContributionsResponse>) => void;
            const generationPromise = new Promise<ApiResponse<GenerateContributionsResponse>>(resolve => {
                resolveGeneration = resolve;
            });
            
            api.dialectic().generateContributions.mockImplementation(() => generationPromise);
            api.dialectic().getProjectDetails.mockResolvedValue({ 
                data: mockProjectDetailsAfterGeneration,
                status: 200,
            });
            api.dialectic().fetchProcessTemplate.mockResolvedValue({
                data: { id: 'pt-1', name: 'Test Template', stages: [], starting_stage_id: 's1' } as any,
                status: 200
            });

            const { generateContributions } = useDialecticStore.getState();

            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('idle');
            
            const resultPromise = generateContributions(mockPayload); 

            // Status is 'generating' immediately after call
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');

            resolveGeneration!({ data: mockSuccessResponse, status: 200 });
            await resultPromise; 

            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('idle');
            expect(useDialecticStore.getState().generateContributionsError).toBeNull();
        });
    });

    // New test suite for submitStageResponses
    describe('submitStageResponses thunk', () => {
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
                selected_model_catalog_ids: [],
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
        const mockProjectId = 'proj-edit-contrib-1';
        const mockSessionId = 'sess-edit-contrib-1';
        const mockContributionId = 'contrib-to-edit-1';
        const originalContent = "This is the original content.";
        const editedContent = "This is the EDITED content.";
        
        const mockPayload: SaveContributionEditPayload = {
            projectId: mockProjectId,
            sessionId: mockSessionId,
            originalContributionIdToEdit: mockContributionId,
            editedContentText: editedContent,
            originalModelContributionId: mockContributionId,
            responseText: 'Feedback for A',
        };

        const mockNewContributionVersion: DialecticContribution = {
            id: 'contrib-1-v2',
            session_id: mockSessionId,
            stage: {
                id: 'stage-1',
                display_name: 'Thesis',
                slug: 'thesis',
                description: '',
                created_at: '',
                default_system_prompt_id: null,
                expected_output_artifacts: null,
                input_artifact_rules: null,
            },
            iteration_number: 1,
            content_storage_path: 'path/to/edited_content.md',
            content_mime_type: 'text/markdown',
            content_size_bytes: editedContent.length,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: 'user-test',
            content_storage_bucket: 'test-bucket',
            raw_response_storage_path: 'path/to/edited_raw_response.json',
            tokens_used_input: null,
            tokens_used_output: null,
            processing_time_ms: null,
            citations: [],
            model_id: 'model-1',
            model_name: 'Model 1',
            prompt_template_id_used: 'pt-1',
            seed_prompt_url: 'https://example.com/seed-prompt',
            is_latest_edit: true,
            edit_version: 2,
            original_model_contribution_id: mockContributionId,
            target_contribution_id: null,
            error: null,
        };
        
        const mockInitialProjectDetail: DialecticProject = {
            id: mockProjectId,
            project_name: 'Project For Edit',
            user_id: 'user-test',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'active',
            initial_user_prompt: 'Initial prompt for project for edit',
            initial_prompt_resource_id: null,
            selected_domain_overlay_id: null,
            selected_domain_id: 'domain-1',
            repo_url: null,
            dialectic_domains: { name: 'Test Domain' },
            dialectic_process_templates: null,
            process_template_id: 'pt-1',
            isLoadingProcessTemplate: false,
            processTemplateError: null,
            contributionGenerationStatus: 'idle',
            generateContributionsError: null,
            isSubmittingStageResponses: false,
            submitStageResponsesError: null,
            isSavingContributionEdit: false,
            saveContributionEditError: null,
            dialectic_sessions: [
                {
                    id: mockSessionId,
                    project_id: mockProjectId,
                    status: 'pending_thesis',
                    iteration_count: 1,
                    current_stage_id: 'thesis',
                    session_description: 'Session for edit',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    selected_model_catalog_ids: [],
                    user_input_reference_url: null,
                    associated_chat_id: null,
                    dialectic_contributions: [
                        {
                            id: mockContributionId, // The original contribution
                            session_id: mockSessionId,
                            stage: {
                                id: 'stage-1',
                                display_name: 'Thesis',
                                slug: 'thesis',
                                description: '',
                                created_at: '',
                                default_system_prompt_id: null,
                                expected_output_artifacts: null,
                                input_artifact_rules: null,
                            },
                            iteration_number: 1,
                            content_storage_path: 'path/to/original_content.md',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            content_mime_type: 'text/markdown',
                            content_size_bytes: originalContent.length,
                            raw_response_storage_path: 'path/to/original_response.md',
                            tokens_used_input: 100,
                            tokens_used_output: 100,
                            processing_time_ms: 100,
                            citations: [],
                            content_storage_bucket: 'bucket-1',
                            user_id: 'user-1',
                            model_id: 'model-1',
                            model_name: 'Model 1',
                            prompt_template_id_used: 'pt-1',
                            seed_prompt_url: 'https://example.com/seed-prompt',
                            is_latest_edit: true, // It's the latest before the edit
                            edit_version: 1,
                            original_model_contribution_id: null, // It's an original
                            target_contribution_id: null,
                            error: null,
                        },
                    ]
                }
            ]
        };

        // This represents the state of the project *after* the refetch.
        const mockProjectForRefetch: DialecticProject = {
            ...mockInitialProjectDetail,
            dialectic_sessions: mockInitialProjectDetail.dialectic_sessions?.map(s => {
                if (s.id !== mockSessionId) return s;
                const updatedContributions = s.dialectic_contributions
                    ? s.dialectic_contributions.map(c => 
                        c.id === mockContributionId ? { ...c, is_latest_edit: false } : c
                      )
                    : [];
                updatedContributions.push(mockNewContributionVersion);
                return { ...s, dialectic_contributions: updatedContributions };
            })
        };

        it('should call api, refetch project on success, and update project state', async () => {
            api.dialectic().saveContributionEdit.mockResolvedValue({ data: mockNewContributionVersion, status: 200 });
            api.dialectic().getProjectDetails.mockResolvedValue({ data: mockProjectForRefetch, status: 200 });

            const { saveContributionEdit } = useDialecticStore.getState();
            const result = await saveContributionEdit(mockPayload);

            const state = useDialecticStore.getState();
            expect(state.isSavingContributionEdit).toBe(false);
            expect(state.saveContributionEditError).toBeNull();
            expect(api.dialectic().saveContributionEdit).toHaveBeenCalledWith(mockPayload);
            expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(mockPayload.projectId);
            expect(state.currentProjectDetail).toEqual(mockProjectForRefetch);
        });

        it('should also update the content cache with the new edited content', async () => {
            api.dialectic().saveContributionEdit.mockResolvedValue({ data: mockNewContributionVersion, status: 200 });
            api.dialectic().getProjectDetails.mockResolvedValue({ data: mockProjectForRefetch, status: 200 });

            const { saveContributionEdit } = useDialecticStore.getState();
            await saveContributionEdit(mockPayload);

            const cacheEntry = useDialecticStore.getState().contributionContentCache[mockNewContributionVersion.id];
            expect(cacheEntry).toBeDefined();
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.content).toBe(editedContent);
            expect(cacheEntry.error).toBeUndefined();
        });

        it('should NOT refetch project details on API error', async () => {
            const apiError: ApiError = { code: 'SAVE_FAILED', message: 'Failed to save contribution.' };
            api.dialectic().saveContributionEdit.mockResolvedValue({ error: apiError, status: 500 });

            const { saveContributionEdit } = useDialecticStore.getState();
            const result = await saveContributionEdit(mockPayload);

            expect(useDialecticStore.getState().isSavingContributionEdit).toBe(false);
            expect(useDialecticStore.getState().saveContributionEditError).toEqual(apiError);
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
            expect(result?.error).toEqual(apiError);
        });

        it('should NOT refetch project details if API call throws', async () => {
            const networkErrorMessage = 'Network connection failed during save';
            api.dialectic().saveContributionEdit.mockRejectedValue(new Error(networkErrorMessage));

            const { saveContributionEdit } = useDialecticStore.getState();
            const result = await saveContributionEdit(mockPayload);

            const expectedError: ApiError = { message: networkErrorMessage, code: 'NETWORK_ERROR' };
            expect(useDialecticStore.getState().isSavingContributionEdit).toBe(false);
            expect(useDialecticStore.getState().saveContributionEditError).toEqual(expectedError);
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
            expect(result?.error).toEqual(expectedError);
        });
    });
});

// Helper to reset store state for testing (already part of DialecticActions in the actual store)
// Ensure this matches the actual _resetForTesting if defined in the store, or remove if not used.
// For this test file, useDialecticStore.getState()._resetForTesting?.() is preferred.
const resetStoreForTest = () => {
    useDialecticStore.setState(useDialecticStore.getState()._resetForTesting ? {} : {}); // A bit of a hack if _reset is not there
};
