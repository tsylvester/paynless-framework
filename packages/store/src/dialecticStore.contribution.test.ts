import { 
    describe, 
    it, 
    expect, 
    beforeEach, 
    afterEach, 
    vi,
} from 'vitest';
import { 
    useDialecticStore, 
} from './dialecticStore';
import { 
  ApiError, 
  ApiResponse, 
  DialecticProject, 
  AIModelCatalogEntry,
  DialecticContribution,
  SubmitStageResponsesPayload,
  SubmitStageResponsesResponse,
  SaveContributionEditPayload,
  GenerateContributionsResponse,
  GenerateContributionsPayload,
  SubmitStageDocumentFeedbackPayload,
  SaveContributionEditSuccessResponse,
  EditedDocumentResource,
  StageDocumentContentState,
  StageDocumentCompositeKey,
} from '@paynless/types';

// We need to import the mock api object and helpers to use in the test
import { 
    api,
    resetApiMock,
    getMockDialecticClient,
    MockDialecticApiClient,
} from '@paynless/api/mocks';

vi.mock('@paynless/api', async () => {
    const { api, resetApiMock, getMockDialecticClient } = await import('@paynless/api/mocks');
    return {
        api,
        resetApiMock,
        getMockDialecticClient,
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
            walletId: 'wallet-123',
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
            api.dialectic().generateContributions.mockResolvedValue({
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
            api.dialectic().generateContributions.mockResolvedValue({
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
            api.dialectic().generateContributions.mockRejectedValue(networkError);
            
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
                sessionId: mockPayload.sessionId,
                projectId: mockPayload.projectId,
                stage: mockPayload.stageSlug,
                iteration: mockPayload.iterationNumber,
                status: 'pending',
                job_ids: ['job-id-1', 'job-id-2'],
                successfulContributions: [],
                failedAttempts: [],
            };
            const mockApiResponse: ApiResponse<GenerateContributionsResponse> = {
                data: mockSuccessResponse,
                status: 202,
            };
            api.dialectic().generateContributions.mockResolvedValue(mockApiResponse);

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
        const modelIdA = 'model-a';
        const modelIdB = 'model-b';
        const docKey1 = 'doc-1';
        const docKey2 = 'doc-2';
        const docKey3 = 'doc-3';

        const compositeKey1 = `${mockSessionId}:${mockStageSlug}:${mockIteration}:${modelIdA}:${docKey1}`;
        const compositeKey2 = `${mockSessionId}:${mockStageSlug}:${mockIteration}:${modelIdA}:${docKey2}`;
        const compositeKey3 = `${mockSessionId}:${mockStageSlug}:${mockIteration}:${modelIdB}:${docKey3}`;

        const mockPayload: SubmitStageResponsesPayload = {
            projectId: mockProjectId,
            sessionId: mockSessionId,
            stageSlug: mockStageSlug,
            currentIterationNumber: mockIteration,
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

        const mockSuccessResponse: SubmitStageResponsesResponse = {
            updatedSession: { 
                ...(mockProjectForRefetch.dialectic_sessions && mockProjectForRefetch.dialectic_sessions[0]), 
                id: mockSessionId,
                project_id: mockProjectId,
                iteration_count: 2,
                session_description: 'A session',
                user_input_reference_url: null,
                selected_model_ids: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'pending_antithesis',
                associated_chat_id: null,
                current_stage_id: 'antithesis',
             },
            message: 'Successfully submitted and prepared next seed.',
        };

        beforeEach(() => {
            mockInitialProjectState = JSON.parse(JSON.stringify(mockProjectForRefetch));
            useDialecticStore.setState({
                currentProjectDetail: mockInitialProjectState,
                selectedModelIds: ['model-1', 'model-2'],
                modelCatalog: mockModelCatalog,
                generatingSessions: {},
                stageDocumentContent: {}, // Ensure it's clean
            });
        });

        it('should identify unsaved drafts, save each, then advance the stage', async () => {
            // Contributions in currentProjectDetail so saveContributionEdit can resolve composite key and clear isDirty
            const contribDoc1: DialecticContribution = {
                id: 'contrib-doc-1',
                session_id: mockSessionId,
                user_id: 'user-1',
                stage: mockStageSlug,
                iteration_number: mockIteration,
                model_id: modelIdA,
                model_name: 'Model A',
                prompt_template_id_used: null,
                seed_prompt_url: null,
                edit_version: 0,
                is_latest_edit: true,
                original_model_contribution_id: null,
                raw_response_storage_path: null,
                target_contribution_id: null,
                tokens_used_input: null,
                tokens_used_output: null,
                processing_time_ms: null,
                error: null,
                citations: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                contribution_type: null,
                file_name: null,
                storage_bucket: null,
                storage_path: null,
                size_bytes: null,
                mime_type: null,
            };
            const contribDoc3: DialecticContribution = {
                ...contribDoc1,
                id: 'contrib-doc-3',
                model_id: modelIdB,
                model_name: 'Model B',
            };
            const projectWithContributions: DialecticProject = {
                ...mockProjectForRefetch,
                dialectic_sessions: mockProjectForRefetch.dialectic_sessions
                    ? [
                          {
                              ...mockProjectForRefetch.dialectic_sessions[0],
                              dialectic_contributions: [contribDoc1, contribDoc3],
                          },
                      ]
                    : [],
            };

            // 1. Setup Mock State with dirty documents (typed so incomplete data is a compile error)
            const stageContent: Record<string, StageDocumentContentState> = {
                    [compositeKey1]: {
                        baselineMarkdown: 'baseline 1',
                        currentDraftMarkdown: 'draft 1',
                        isDirty: true,
                        isLoading: false,
                        error: null,
                        lastBaselineVersion: null,
                        pendingDiff: 'diff 1',
                        lastAppliedVersionHash: null,
                        sourceContributionId: 'contrib-doc-1',
                        feedbackDraftMarkdown: '',
                        feedbackIsDirty: false,
                    },
                    [compositeKey2]: { // This one is not dirty
                        baselineMarkdown: 'baseline 2',
                        currentDraftMarkdown: 'baseline 2',
                        isDirty: false,
                        isLoading: false,
                        error: null,
                        lastBaselineVersion: null,
                        pendingDiff: null,
                        lastAppliedVersionHash: null,
                        sourceContributionId: null,
                        feedbackDraftMarkdown: '',
                        feedbackIsDirty: false,
                    },
                    [compositeKey3]: {
                        baselineMarkdown: 'baseline 3',
                        currentDraftMarkdown: 'draft 3',
                        isDirty: true,
                        isLoading: false,
                        error: null,
                        lastBaselineVersion: null,
                        pendingDiff: 'diff 3',
                        lastAppliedVersionHash: null,
                        sourceContributionId: 'contrib-doc-3',
                        feedbackDraftMarkdown: '',
                        feedbackIsDirty: false,
                    },
                };
            useDialecticStore.setState({
                currentProjectDetail: projectWithContributions,
                stageDocumentContent: stageContent,
                stageDocumentResources: {
                    [compositeKey1]: {
                        id: 'resource-doc-1',
                        resource_type: 'rendered_document',
                        project_id: mockProjectId,
                        session_id: mockSessionId,
                        stage_slug: mockStageSlug,
                        iteration_number: mockIteration,
                        document_key: docKey1,
                        source_contribution_id: 'contrib-doc-1',
                        storage_bucket: 'test-bucket',
                        storage_path: '/path/to/doc-1.md',
                        file_name: 'doc-1.md',
                        mime_type: 'text/markdown',
                        size_bytes: 100,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                    [compositeKey3]: {
                        id: 'resource-doc-3',
                        resource_type: 'rendered_document',
                        project_id: mockProjectId,
                        session_id: mockSessionId,
                        stage_slug: mockStageSlug,
                        iteration_number: mockIteration,
                        document_key: docKey3,
                        source_contribution_id: 'contrib-doc-3',
                        storage_bucket: 'test-bucket',
                        storage_path: '/path/to/doc-3.md',
                        file_name: 'doc-3.md',
                        mime_type: 'text/markdown',
                        size_bytes: 100,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                },
            });

            const mockSaveEditResource1: EditedDocumentResource = {
                id: 'resource-doc-1',
                resource_type: 'rendered_document',
                project_id: mockProjectId,
                session_id: mockSessionId,
                stage_slug: mockStageSlug,
                iteration_number: mockIteration,
                document_key: docKey1,
                source_contribution_id: 'contrib-doc-1',
                storage_bucket: 'test-bucket',
                storage_path: '/path/to/doc-1.md',
                file_name: 'doc-1.md',
                mime_type: 'text/markdown',
                size_bytes: 100,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const mockSaveEditResource3: EditedDocumentResource = {
                id: 'resource-doc-3',
                resource_type: 'rendered_document',
                project_id: mockProjectId,
                session_id: mockSessionId,
                stage_slug: mockStageSlug,
                iteration_number: mockIteration,
                document_key: docKey3,
                source_contribution_id: 'contrib-doc-3',
                storage_bucket: 'test-bucket',
                storage_path: '/path/to/doc-3.md',
                file_name: 'doc-3.md',
                mime_type: 'text/markdown',
                size_bytes: 100,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            api.dialectic().saveContributionEdit
                .mockResolvedValueOnce({ data: { resource: mockSaveEditResource1, sourceContributionId: 'contrib-doc-1' }, status: 201 })
                .mockResolvedValueOnce({ data: { resource: mockSaveEditResource3, sourceContributionId: 'contrib-doc-3' }, status: 201 });
            const submitStageResponsesSpy = vi.spyOn(api.dialectic(), 'submitStageResponses').mockResolvedValue({ data: mockSuccessResponse, status: 200 });
            api.dialectic().getProjectDetails.mockResolvedValueOnce({
                data: mockProjectForRefetch,
                status: 200,
            });

            const { submitStageResponses } = useDialecticStore.getState();
            await submitStageResponses(mockPayload);

            expect(api.dialectic().saveContributionEdit).toHaveBeenCalledTimes(2);
            expect(api.dialectic().saveContributionEdit).toHaveBeenCalledWith(
                expect.objectContaining({
                    editedContentText: 'draft 1',
                    originalContributionIdToEdit: 'contrib-doc-1',
                    documentKey: docKey1,
                }),
            );
            expect(api.dialectic().saveContributionEdit).toHaveBeenCalledWith(
                expect.objectContaining({
                    editedContentText: 'draft 3',
                    originalContributionIdToEdit: 'contrib-doc-3',
                    documentKey: docKey3,
                }),
            );
            expect(api.dialectic().submitStageDocumentFeedback).toHaveBeenCalledTimes(0);
            expect(submitStageResponsesSpy).toHaveBeenCalledTimes(1);
            expect(submitStageResponsesSpy).toHaveBeenCalledWith(mockPayload);
            expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(mockProjectId);
            const state = useDialecticStore.getState();
            expect(state.isSubmittingStageResponses).toBe(false);
            expect(state.submitStageResponsesError).toBeNull();
            expect(state.stageDocumentContent[compositeKey1]?.isDirty).toBe(false);
            expect(state.stageDocumentContent[compositeKey3]?.isDirty).toBe(false);
        });

        it('should advance the stage without saving feedback if no drafts are dirty', async () => {
            const stageContent: Record<string, StageDocumentContentState> = {
                    [compositeKey1]: {
                        baselineMarkdown: 'baseline 1',
                        currentDraftMarkdown: 'baseline 1',
                        isDirty: false,
                        isLoading: false,
                        error: null,
                        lastBaselineVersion: null,
                        pendingDiff: null,
                        lastAppliedVersionHash: null,
                        sourceContributionId: null,
                        feedbackDraftMarkdown: '',
                        feedbackIsDirty: false,
                    },
                };
             useDialecticStore.setState({
                stageDocumentContent: stageContent,
            });

            const submitDocFeedbackSpy = vi.spyOn(useDialecticStore.getState(), 'submitStageDocumentFeedback');
            const submitStageResponsesSpy = vi.spyOn(api.dialectic(), 'submitStageResponses');
            
            submitStageResponsesSpy.mockResolvedValue({ data: mockSuccessResponse, status: 200 });
            api.dialectic().getProjectDetails.mockResolvedValueOnce({
                data: mockProjectForRefetch,
                status: 200,
            });

            const { submitStageResponses } = useDialecticStore.getState();
            await submitStageResponses(mockPayload);

            expect(submitDocFeedbackSpy).not.toHaveBeenCalled();
            expect(submitStageResponsesSpy).toHaveBeenCalledTimes(1);
            expect(submitStageResponsesSpy).toHaveBeenCalledWith(mockPayload);
        });

        it('should halt and set an error if saving a document feedback fails', async () => {
            const saveError: ApiError = { message: 'Failed to save draft', code: 'SAVE_FAILED' };
            const stageContent: Record<string, StageDocumentContentState> = {
                    [compositeKey1]: {
                        baselineMarkdown: 'baseline 1',
                        currentDraftMarkdown: 'draft 1',
                        isDirty: true,
                        isLoading: false,
                        error: null,
                        lastBaselineVersion: null,
                        pendingDiff: 'diff 1',
                        lastAppliedVersionHash: null,
                        sourceContributionId: 'contrib-doc-1',
                        feedbackDraftMarkdown: '',
                        feedbackIsDirty: false,
                    },
                };
            useDialecticStore.setState({
                stageDocumentContent: stageContent,
                stageDocumentResources: {
                    [compositeKey1]: {
                        id: 'resource-doc-1',
                        resource_type: 'rendered_document',
                        project_id: mockProjectId,
                        session_id: mockSessionId,
                        stage_slug: mockStageSlug,
                        iteration_number: mockIteration,
                        document_key: docKey1,
                        source_contribution_id: 'contrib-doc-1',
                        storage_bucket: 'test-bucket',
                        storage_path: '/path/to/doc-1.md',
                        file_name: 'doc-1.md',
                        mime_type: 'text/markdown',
                        size_bytes: 100,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                },
            });
            const submitStageResponsesSpy = vi.spyOn(api.dialectic(), 'submitStageResponses');
            api.dialectic().saveContributionEdit.mockResolvedValue({ error: saveError, status: 500 });

            const { submitStageResponses } = useDialecticStore.getState();
            await submitStageResponses(mockPayload);

            const state = useDialecticStore.getState();
            expect(api.dialectic().saveContributionEdit).toHaveBeenCalledTimes(1);
            expect(submitStageResponsesSpy).not.toHaveBeenCalled();
            expect(state.isSubmittingStageResponses).toBe(false);
            expect(state.submitStageResponsesError).toEqual(saveError);
        });

        it('16.c.i: when one key has both content dirty and feedback dirty, submitStageResponses calls both saveContributionEdit (with currentDraftMarkdown) and submitStageDocumentFeedback (with feedbackDraftMarkdown) for that key', async () => {
            const stageContent: Record<string, StageDocumentContentState> = {
                [compositeKey1]: {
                    baselineMarkdown: 'baseline 1',
                    currentDraftMarkdown: 'content edit',
                    isDirty: true,
                    isLoading: false,
                    error: null,
                    lastBaselineVersion: null,
                    pendingDiff: 'content edit',
                    lastAppliedVersionHash: null,
                    sourceContributionId: 'contrib-doc-1',
                    feedbackDraftMarkdown: 'feedback text',
                    feedbackIsDirty: true,
                },
            };
            useDialecticStore.setState({
                stageDocumentContent: stageContent,
                stageDocumentResources: {
                    [compositeKey1]: {
                        id: 'resource-doc-1',
                        resource_type: 'rendered_document',
                        project_id: mockProjectId,
                        session_id: mockSessionId,
                        stage_slug: mockStageSlug,
                        iteration_number: mockIteration,
                        document_key: docKey1,
                        source_contribution_id: 'contrib-doc-1',
                        storage_bucket: 'test-bucket',
                        storage_path: '/path/to/doc-1.md',
                        file_name: 'doc-1.md',
                        mime_type: 'text/markdown',
                        size_bytes: 100,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                },
            });

            const mockSaveEditResource: EditedDocumentResource = {
                id: 'resource-doc-1',
                resource_type: 'rendered_document',
                project_id: mockProjectId,
                session_id: mockSessionId,
                stage_slug: mockStageSlug,
                iteration_number: mockIteration,
                document_key: docKey1,
                source_contribution_id: 'contrib-doc-1',
                storage_bucket: 'test-bucket',
                storage_path: '/path/to/doc-1.md',
                file_name: 'doc-1.md',
                mime_type: 'text/markdown',
                size_bytes: 100,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            api.dialectic().saveContributionEdit.mockResolvedValue({
                data: { resource: mockSaveEditResource, sourceContributionId: 'contrib-doc-1' },
                status: 201,
            });
            api.dialectic().submitStageDocumentFeedback.mockResolvedValue({ data: { success: true }, status: 200 });
            const submitStageResponsesSpy = vi.spyOn(api.dialectic(), 'submitStageResponses').mockResolvedValue({ data: mockSuccessResponse, status: 200 });
            api.dialectic().getProjectDetails.mockResolvedValueOnce({ data: mockProjectForRefetch, status: 200 });

            await useDialecticStore.getState().submitStageResponses(mockPayload);

            expect(api.dialectic().saveContributionEdit).toHaveBeenCalledTimes(1);
            expect(api.dialectic().saveContributionEdit).toHaveBeenCalledWith(
                expect.objectContaining({
                    editedContentText: 'content edit',
                    originalContributionIdToEdit: 'contrib-doc-1',
                    documentKey: docKey1,
                }),
            );
            expect(api.dialectic().submitStageDocumentFeedback).toHaveBeenCalledTimes(1);
            expect(api.dialectic().submitStageDocumentFeedback).toHaveBeenCalledWith(
                expect.objectContaining({
                    feedback: 'feedback text',
                    documentKey: docKey1,
                }),
            );
            expect(submitStageResponsesSpy).toHaveBeenCalledTimes(1);
        });

        it('16.c.ii: when multiple keys have mixed states, every dirty content edit and every dirty feedback draft is submitted exactly once; advance runs only after all succeed', async () => {
            const stageContent: Record<string, StageDocumentContentState> = {
                [compositeKey1]: {
                    baselineMarkdown: 'b1',
                    currentDraftMarkdown: 'content 1',
                    isDirty: true,
                    isLoading: false,
                    error: null,
                    lastBaselineVersion: null,
                    pendingDiff: 'content 1',
                    lastAppliedVersionHash: null,
                    sourceContributionId: 'contrib-doc-1',
                    feedbackDraftMarkdown: '',
                    feedbackIsDirty: false,
                },
                [compositeKey2]: {
                    baselineMarkdown: 'b2',
                    currentDraftMarkdown: 'b2',
                    isDirty: false,
                    isLoading: false,
                    error: null,
                    lastBaselineVersion: null,
                    pendingDiff: null,
                    lastAppliedVersionHash: null,
                    sourceContributionId: null,
                    feedbackDraftMarkdown: 'feedback 2',
                    feedbackIsDirty: true,
                },
                [compositeKey3]: {
                    baselineMarkdown: 'b3',
                    currentDraftMarkdown: 'content 3',
                    isDirty: true,
                    isLoading: false,
                    error: null,
                    lastBaselineVersion: null,
                    pendingDiff: 'content 3',
                    lastAppliedVersionHash: null,
                    sourceContributionId: 'contrib-doc-3',
                    feedbackDraftMarkdown: 'feedback 3',
                    feedbackIsDirty: true,
                },
            };
            useDialecticStore.setState({
                stageDocumentContent: stageContent,
                stageDocumentResources: {
                    [compositeKey1]: {
                        id: 'res-1',
                        resource_type: 'rendered_document',
                        project_id: mockProjectId,
                        session_id: mockSessionId,
                        stage_slug: mockStageSlug,
                        iteration_number: mockIteration,
                        document_key: docKey1,
                        source_contribution_id: 'contrib-doc-1',
                        storage_bucket: 'b',
                        storage_path: '/p1',
                        file_name: 'f1.md',
                        mime_type: 'text/markdown',
                        size_bytes: 1,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                    [compositeKey2]: {
                        id: 'res-2',
                        resource_type: 'rendered_document',
                        project_id: mockProjectId,
                        session_id: mockSessionId,
                        stage_slug: mockStageSlug,
                        iteration_number: mockIteration,
                        document_key: docKey2,
                        source_contribution_id: null,
                        storage_bucket: 'b',
                        storage_path: '/p2',
                        file_name: 'f2.md',
                        mime_type: 'text/markdown',
                        size_bytes: 1,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                    [compositeKey3]: {
                        id: 'res-3',
                        resource_type: 'rendered_document',
                        project_id: mockProjectId,
                        session_id: mockSessionId,
                        stage_slug: mockStageSlug,
                        iteration_number: mockIteration,
                        document_key: docKey3,
                        source_contribution_id: 'contrib-doc-3',
                        storage_bucket: 'b',
                        storage_path: '/p3',
                        file_name: 'f3.md',
                        mime_type: 'text/markdown',
                        size_bytes: 1,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                },
            });

            const mockSaveEditResource1: EditedDocumentResource = {
                id: 'res-1',
                resource_type: 'rendered_document',
                project_id: mockProjectId,
                session_id: mockSessionId,
                stage_slug: mockStageSlug,
                iteration_number: mockIteration,
                document_key: docKey1,
                source_contribution_id: 'contrib-doc-1',
                storage_bucket: 'b',
                storage_path: '/p1',
                file_name: 'f1.md',
                mime_type: 'text/markdown',
                size_bytes: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const mockSaveEditResource3: EditedDocumentResource = {
                id: 'res-3',
                resource_type: 'rendered_document',
                project_id: mockProjectId,
                session_id: mockSessionId,
                stage_slug: mockStageSlug,
                iteration_number: mockIteration,
                document_key: docKey3,
                source_contribution_id: 'contrib-doc-3',
                storage_bucket: 'b',
                storage_path: '/p3',
                file_name: 'f3.md',
                mime_type: 'text/markdown',
                size_bytes: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            api.dialectic().saveContributionEdit
                .mockResolvedValueOnce({ data: { resource: mockSaveEditResource1, sourceContributionId: 'contrib-doc-1' }, status: 201 })
                .mockResolvedValueOnce({ data: { resource: mockSaveEditResource3, sourceContributionId: 'contrib-doc-3' }, status: 201 });
            api.dialectic().submitStageDocumentFeedback.mockResolvedValue({ data: { success: true }, status: 200 });
            const submitStageResponsesSpy = vi.spyOn(api.dialectic(), 'submitStageResponses').mockResolvedValue({ data: mockSuccessResponse, status: 200 });
            api.dialectic().getProjectDetails.mockResolvedValueOnce({ data: mockProjectForRefetch, status: 200 });

            await useDialecticStore.getState().submitStageResponses(mockPayload);

            expect(api.dialectic().saveContributionEdit).toHaveBeenCalledTimes(2);
            expect(api.dialectic().submitStageDocumentFeedback).toHaveBeenCalledTimes(2);
            expect(submitStageResponsesSpy).toHaveBeenCalledTimes(1);
            const state = useDialecticStore.getState();
            expect(state.submitStageResponsesError).toBeNull();
        });

        it('16.c.iii: updateStageDocumentFeedbackDraft only updates feedback draft state', () => {
            const key: StageDocumentCompositeKey = {
                sessionId: mockSessionId,
                stageSlug: mockStageSlug,
                iterationNumber: mockIteration,
                modelId: modelIdA,
                documentKey: docKey1,
            };
            const serializedKey = compositeKey1;
            const initialContent: StageDocumentContentState = {
                baselineMarkdown: 'baseline',
                currentDraftMarkdown: 'content draft',
                isDirty: true,
                isLoading: false,
                error: null,
                lastBaselineVersion: null,
                pendingDiff: 'content draft',
                lastAppliedVersionHash: null,
                sourceContributionId: null,
                feedbackDraftMarkdown: '',
                feedbackIsDirty: false,
            };
            useDialecticStore.setState({
                stageDocumentContent: { [serializedKey]: initialContent },
            });

            useDialecticStore.getState().updateStageDocumentFeedbackDraft(key, 'new feedback');

            const state = useDialecticStore.getState();
            const entry = state.stageDocumentContent[serializedKey];
            expect(entry).toBeDefined();
            expect(entry?.feedbackDraftMarkdown).toBe('new feedback');
            expect(entry?.feedbackIsDirty).toBe(true);
            expect(entry?.currentDraftMarkdown).toBe('content draft');
            expect(entry?.isDirty).toBe(true);
        });
    });

    // New test suite for saveContributionEdit
    describe('saveContributionEdit thunk', () => {
        const mockProjectId = 'proj-edit-1';
        const mockSessionId = 'sess-edit-1';
        const originalContributionId = 'contrib-edit-original';

        // Correctly structured payload (documentKey and resourceType required per SaveContributionEditPayload)
        const mockPayload: SaveContributionEditPayload = {
            projectId: mockProjectId,
            sessionId: mockSessionId,
            originalContributionIdToEdit: originalContributionId,
            editedContentText: 'This is the new, edited content.',
            originalModelContributionId: originalContributionId,
            responseText: 'User feedback on the edit.',
            documentKey: 'synthesis',
            resourceType: 'rendered_document',
        };

        const mockEditedDocumentResource: EditedDocumentResource = {
            id: 'resource-edit-new-123',
            resource_type: 'rendered_document',
            project_id: mockProjectId,
            session_id: mockSessionId,
            stage_slug: 'synthesis',
            iteration_number: 1,
            document_key: 'synthesis',
            source_contribution_id: originalContributionId,
            storage_bucket: 'test-bucket',
            storage_path: 'path/to/resource-edit-new-123.md',
            file_name: 'resource-edit-new-123.md',
            mime_type: 'text/markdown',
            size_bytes: 1234,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const mockSaveContributionEditResponse: SaveContributionEditSuccessResponse = {
            resource: mockEditedDocumentResource,
            sourceContributionId: originalContributionId,
        };

        const mockApiResponse: ApiResponse<SaveContributionEditSuccessResponse> = {
            status: 201,
            data: mockSaveContributionEditResponse,
        };

        const originalContribution: DialecticContribution = {
            id: originalContributionId,
            session_id: mockSessionId,
            user_id: 'user-1',
            stage: 'synthesis',
            iteration_number: 1,
            model_id: 'model-1',
            job_id: 'job-1',
            status: 'completed',
            original_model_contribution_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            model_name: 'Test Model 1',
            prompt_template_id_used: 'prompt-template-1',
            seed_prompt_url: 'path/to/seed.md',
            edit_version: 0,
            is_latest_edit: true,
            raw_response_storage_path: 'path/to/raw.json',
            target_contribution_id: null,
            tokens_used_input: 10,
            tokens_used_output: 20,
            processing_time_ms: 100,
            error: null,
            citations: null,
            contribution_type: 'synthesis',
            file_name: 'synthesis.md',
            storage_bucket: 'test-bucket',
            storage_path: 'path/to/synthesis.md',
            size_bytes: 1234,
            mime_type: 'text/markdown',
        };

        const initialProjectState: DialecticProject = {
            id: mockProjectId,
            dialectic_sessions: [{
                id: mockSessionId,
                dialectic_contributions: [originalContribution],
                iteration_count: 1,
                project_id: mockProjectId,
                session_description: 'A session',
                user_input_reference_url: null,
                selected_model_ids: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'pending_hypothesis',
                associated_chat_id: null,
                current_stage_id: 'thesis',
            }],
            user_id: 'user-1',
            project_name: 'Test Project',
            selected_domain_id: 'domain-1',
            dialectic_domains: { name: 'Test Domain' },
            selected_domain_overlay_id: null,
            repo_url: null,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
        };
        
        beforeEach(() => {
            // Reset mocks before each test
            resetApiMock();
            // Mock setup: API client returns SaveContributionEditSuccessResponse per step 59
            api.dialectic().saveContributionEdit.mockResolvedValue(mockApiResponse);
        });

        it('should patch stageDocumentContent with EditedDocumentResource and avoid mutating dialectic_contributions', async () => {
            useDialecticStore.setState({ 
                currentProjectDetail: initialProjectState,
                stageDocumentContent: {},
                stageDocumentResources: {},
            });

            const { saveContributionEdit } = useDialecticStore.getState();
            await saveContributionEdit(mockPayload);

            const finalState = useDialecticStore.getState();
            
            // Assert stageDocumentContent is updated with the new resource
            // Composite key format: ${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}
            const compositeKey = `${mockSessionId}:synthesis:1:model-1:synthesis`;
            const documentEntry = finalState.stageDocumentContent[compositeKey];
            expect(documentEntry).toBeDefined();
            expect(documentEntry?.baselineMarkdown).toBe('This is the new, edited content.');
            expect(documentEntry?.currentDraftMarkdown).toBe('This is the new, edited content.');
            expect(documentEntry?.isDirty).toBe(false);
            
            // Assert that the document cache now reflects the new markdown and is the authoritative source
            // The edited markdown must be present in stageDocumentContent, not in dialectic_contributions
            expect(documentEntry?.baselineMarkdown).toBe(mockPayload.editedContentText);
            expect(documentEntry?.currentDraftMarkdown).toBe(mockPayload.editedContentText);
            expect(documentEntry?.baselineMarkdown).not.toBe(originalContribution.contribution_type || '');
            
            // CRITICAL: Assert that the complete EditedDocumentResource metadata is stored in stageDocumentResources map
            // This is required so UI components can access source_contribution_id, updated_at, and other metadata
            const storedResource = finalState.stageDocumentResources[compositeKey];
            expect(storedResource).toBeDefined();
            expect(storedResource).toEqual(mockEditedDocumentResource);
            
            // Explicitly assert all EditedDocumentResource fields are present and correct
            expect(storedResource?.id).toBe(mockEditedDocumentResource.id);
            expect(storedResource?.resource_type).toBe(mockEditedDocumentResource.resource_type);
            expect(storedResource?.project_id).toBe(mockEditedDocumentResource.project_id);
            expect(storedResource?.session_id).toBe(mockEditedDocumentResource.session_id);
            expect(storedResource?.stage_slug).toBe(mockEditedDocumentResource.stage_slug);
            expect(storedResource?.iteration_number).toBe(mockEditedDocumentResource.iteration_number);
            expect(storedResource?.document_key).toBe(mockEditedDocumentResource.document_key);
            expect(storedResource?.source_contribution_id).toBe(mockEditedDocumentResource.source_contribution_id);
            expect(storedResource?.storage_bucket).toBe(mockEditedDocumentResource.storage_bucket);
            expect(storedResource?.storage_path).toBe(mockEditedDocumentResource.storage_path);
            expect(storedResource?.file_name).toBe(mockEditedDocumentResource.file_name);
            expect(storedResource?.mime_type).toBe(mockEditedDocumentResource.mime_type);
            expect(storedResource?.size_bytes).toBe(mockEditedDocumentResource.size_bytes);
            expect(storedResource?.created_at).toBe(mockEditedDocumentResource.created_at);
            expect(storedResource?.updated_at).toBe(mockEditedDocumentResource.updated_at);
            
            // Assert dialectic_contributions is NOT mutated (except isLatestEdit flag)
            const session = finalState.currentProjectDetail?.dialectic_sessions?.find(s => s.id === mockSessionId);
            const originalContributionInState = session?.dialectic_contributions?.find(c => c.id === originalContributionId);
            expect(originalContributionInState).toBeDefined(); // Original contribution still exists
            expect(originalContributionInState?.is_latest_edit).toBe(false); // Flag toggled to false via backend response
            
            // Assert no new contribution was added to the array (resource ID is not a contribution ID)
            // saveContributionEdit must not add the EditedDocumentResource to dialectic_contributions
            const contributionsCount = session?.dialectic_contributions?.length ?? 0;
            expect(contributionsCount).toBe(1); // Only original contribution remains
            const resourceAsContribution = session?.dialectic_contributions?.find(c => c.id === mockApiResponse.data!.resource.id);
            expect(resourceAsContribution).toBeUndefined(); // Resource ID should not exist in contributions
            
            // Assert that saveContributionEdit does not touch contribution arrays beyond toggling isLatestEdit
            // The implementation must leave dialectic_contributions unchanged except for the is_latest_edit flag
            expect(session?.dialectic_contributions).toHaveLength(1);
            expect(session?.dialectic_contributions?.[0]?.id).toBe(originalContributionId);
            // Verify the original contribution's content remains unchanged (document cache is the source of truth)
            const originalContributionContent = originalContributionInState?.contribution_type || originalContribution.contribution_type;
            expect(originalContributionContent).not.toBe(mockPayload.editedContentText);
            
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
        });
        
        it('should set an error if the API call fails', async () => {
            const mockError: ApiError = { code: 'SAVE_ERROR', message: 'Could not save' };
            const mockDialecticClient: MockDialecticApiClient = getMockDialecticClient();
            mockDialecticClient.saveContributionEdit.mockResolvedValue({ error: mockError, status: 500 });

            const { saveContributionEdit } = useDialecticStore.getState();
            const result = await saveContributionEdit(mockPayload);

            expect(result.error).toEqual(mockError);
            const finalState = useDialecticStore.getState();
            expect(finalState.isSavingContributionEdit).toBe(false);
            expect(finalState.saveContributionEditError).toEqual(mockError);
        });
    });
});
