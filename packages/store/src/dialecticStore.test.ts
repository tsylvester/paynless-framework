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
  DialecticDomain,
  DialecticProcessTemplate,
  DialecticStage,
  GenerateContributionsPayload,
  GenerateContributionsResponse,
  ContributionGenerationStatus,
  GetSessionDetailsResponse,
  DialecticLifecycleEvent,
  SaveContributionEditPayload,
  SaveContributionEditSuccessResponse,
  EditedDocumentResource,
  DialecticContribution,
  StageDocumentCompositeKey,
  SelectedModels,
  GetAllStageProgressPayload,
  SubmitStageResponsesPayload,
} from '@paynless/types';
import { getStageRunDocumentKey, getStageDocumentKey } from './dialecticStore.documents';
import { useAuthStore } from './authStore';

// Add the mock call here
vi.mock('@paynless/api', async () => {
    // Import the parts of the mock we need
    const { api, resetApiMock, getMockDialecticClient } = await import('@paynless/api/mocks'); 
    
    return {
        api, // Provide the mocked api object
        initializeApiClient: vi.fn(), 
        // Expose reset and getter for test cleanup and setup
        resetApiMock,
        getMockDialecticClient,
    };
});

// Import the shared mock setup - these are test utilities, not part of the mocked module itself.
import { api } from '@paynless/api';
import { resetApiMock, getMockDialecticClient } from '@paynless/api/mocks';

describe('useDialecticStore', () => {
    beforeEach(() => {
        resetApiMock();
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks();
    });

    describe('Initial State', () => {
        it('should initialize with default values', () => {
            const state = useDialecticStore.getState();
            expect(state.domains).toEqual(initialDialecticStateValues.domains);
            expect(state.isLoadingDomains).toBe(initialDialecticStateValues.isLoadingDomains);
            expect(state.domainsError).toBe(initialDialecticStateValues.domainsError);

            // Check new initial state for Domain Overlays
            expect(state.selectedStageAssociation).toBe(initialDialecticStateValues.selectedStageAssociation);
            expect(state.availableDomainOverlays).toEqual(initialDialecticStateValues.availableDomainOverlays);
            expect(state.isLoadingDomainOverlays).toBe(initialDialecticStateValues.isLoadingDomainOverlays);
            expect(state.domainOverlaysError).toBe(initialDialecticStateValues.domainOverlaysError);
            // End check new initial state for Domain Overlays

            expect(state.projects).toEqual(initialDialecticStateValues.projects);
            expect(state.isLoadingProjects).toBe(initialDialecticStateValues.isLoadingProjects);
            expect(state.projectsError).toBe(initialDialecticStateValues.projectsError);

            expect(state.currentProjectDetail).toBe(initialDialecticStateValues.currentProjectDetail);
            expect(state.isLoadingProjectDetail).toBe(initialDialecticStateValues.isLoadingProjectDetail);
            expect(state.projectDetailError).toBe(initialDialecticStateValues.projectDetailError);

            expect(state.modelCatalog).toEqual(initialDialecticStateValues.modelCatalog);
            expect(state.isLoadingModelCatalog).toBe(initialDialecticStateValues.isLoadingModelCatalog);
            expect(state.modelCatalogError).toBe(initialDialecticStateValues.modelCatalogError);
            
            expect(state.isCreatingProject).toBe(initialDialecticStateValues.isCreatingProject);
            expect(state.createProjectError).toBe(initialDialecticStateValues.createProjectError);

            expect(state.isStartingSession).toBe(initialDialecticStateValues.isStartingSession);
            expect(state.startSessionError).toBe(initialDialecticStateValues.startSessionError);

            // Verify new initial state for contribution generation
            expect(state.contributionGenerationStatus).toBe(initialDialecticStateValues.contributionGenerationStatus);
            expect(state.generateContributionsError).toBe(initialDialecticStateValues.generateContributionsError);

            expect(state.contributionContentCache).toEqual(initialDialecticStateValues.contributionContentCache);

            // Verify new initial state for single session fetching
            expect(state.activeSessionDetail).toBe(initialDialecticStateValues.activeSessionDetail);
            expect(state.isLoadingActiveSessionDetail).toBe(initialDialecticStateValues.isLoadingActiveSessionDetail);
            expect(state.activeSessionDetailError).toBe(initialDialecticStateValues.activeSessionDetailError);
        });
    });

    describe('resetCreateProjectError action', () => {
        it('should set createProjectError to null', () => {
            // Set an initial error
            useDialecticStore.setState({ createProjectError: { code: 'ERROR', message: 'Some error' } });
            let state = useDialecticStore.getState();
            expect(state.createProjectError).not.toBeNull();

            // Call the reset action
            state.resetCreateProjectError();
            state = useDialecticStore.getState(); // Re-fetch state after action
            expect(state.createProjectError).toBeNull();
        });
    });

    describe('resetProjectDetailsError action', () => {
        it('should set projectDetailError to null', () => {
            // Set an initial error
            useDialecticStore.setState({ projectDetailError: { code: 'ERROR', message: 'Some details error' } });
            let state = useDialecticStore.getState();
            expect(state.projectDetailError).not.toBeNull();

            // Call the reset action
            state.resetProjectDetailsError();
            state = useDialecticStore.getState(); // Re-fetch state after action
            expect(state.projectDetailError).toBeNull();
        });
    });

    describe('resetSelectedModels action', () => {
        it('should set selectedModels to an empty array', () => {
            const initialSelectedModels: SelectedModels[] = [
                { id: 'model-1', displayName: 'Model One' },
                { id: 'model-2', displayName: 'Model Two' },
            ];
            useDialecticStore.setState({ selectedModels: initialSelectedModels });
            let state = useDialecticStore.getState();
            expect(state.selectedModels).toEqual(initialSelectedModels);

            state.resetSelectedModels();
            state = useDialecticStore.getState();
            expect(state.selectedModels).toEqual([]);
        });
    });


        describe('setSelectedModels action', () => {
        it('should set selectedModels to the provided array', () => {
            const { setSelectedModels } = useDialecticStore.getState();
            const newModels: SelectedModels[] = [
                { id: 'model-1', displayName: 'Model One' },
                { id: 'model-2', displayName: 'Model Two' },
            ];
            setSelectedModels(newModels);
            const state = useDialecticStore.getState();
            expect(state.selectedModels).toEqual(newModels);
        });
    });

    describe('setModelMultiplicity action', () => {
        it('should add and remove full SelectedModels objects correctly', () => {
            const modelA: SelectedModels = { id: 'model-a', displayName: 'Model A' };
            const modelB: SelectedModels = { id: 'model-b', displayName: 'Model B' };
            const modelC: SelectedModels = { id: 'model-c', displayName: 'Model C' };

            useDialecticStore.setState({
                selectedModels: [modelA, modelB],
                modelCatalog: [
                    {
                        id: 'model-a',
                        model_name: 'Model A',
                        provider_name: 'P',
                        api_identifier: 'ma',
                        created_at: '',
                        updated_at: '',
                        context_window_tokens: 1000,
                        input_token_cost_usd_millionths: 1,
                        output_token_cost_usd_millionths: 1,
                        max_output_tokens: 500,
                        is_active: true,
                        description: null,
                        strengths: null,
                        weaknesses: null,
                    },
                    {
                        id: 'model-b',
                        model_name: 'Model B',
                        provider_name: 'P',
                        api_identifier: 'mb',
                        created_at: '',
                        updated_at: '',
                        context_window_tokens: 1000,
                        input_token_cost_usd_millionths: 1,
                        output_token_cost_usd_millionths: 1,
                        max_output_tokens: 500,
                        is_active: true,
                        description: null,
                        strengths: null,
                        weaknesses: null,
                    },
                    {
                        id: 'model-c',
                        model_name: 'Model C',
                        provider_name: 'P',
                        api_identifier: 'mc',
                        created_at: '',
                        updated_at: '',
                        context_window_tokens: 1000,
                        input_token_cost_usd_millionths: 1,
                        output_token_cost_usd_millionths: 1,
                        max_output_tokens: 500,
                        is_active: true,
                        description: null,
                        strengths: null,
                        weaknesses: null,
                    },
                ],
            });
            const { setModelMultiplicity } = useDialecticStore.getState();

            // Increase multiplicity
            setModelMultiplicity(modelA, 2);
            let state = useDialecticStore.getState();
            expect(state.selectedModels).toBeDefined();
            if (state.selectedModels) {
                expect(state.selectedModels).toHaveLength(3);
                expect(state.selectedModels.filter((m) => m.id === 'model-a')).toHaveLength(2);
                expect(state.selectedModels.filter((m) => m.id === 'model-b')).toHaveLength(1);
            }

            // Decrease multiplicity
            setModelMultiplicity(modelA, 1);
            state = useDialecticStore.getState();
            expect(state.selectedModels).toBeDefined();
            if (state.selectedModels) {
                expect(state.selectedModels).toHaveLength(2);
                expect(state.selectedModels.filter((m) => m.id === 'model-a')).toHaveLength(1);
            }

            // Remove completely
            setModelMultiplicity(modelB, 0);
            state = useDialecticStore.getState();
            expect(state.selectedModels).toBeDefined();
            if (state.selectedModels) {
                expect(state.selectedModels).toHaveLength(1);
                expect(state.selectedModels[0].id).toBe('model-a');
            }

            // Add new model
            setModelMultiplicity(modelC, 1);
            state = useDialecticStore.getState();
            expect(state.selectedModels).toBeDefined();
            if (state.selectedModels) {
                expect(state.selectedModels).toHaveLength(2);
                expect(state.selectedModels.find((m) => m.id === 'model-c')).toEqual(modelC);
            }
        });

        it('should preserve displayName when changing multiplicity', () => {
            const modelX: SelectedModels = { id: 'model-x', displayName: 'Model X Display' };
            useDialecticStore.setState({
                selectedModels: [modelX],
                modelCatalog: [
                    {
                        id: 'model-x',
                        model_name: 'Model X Display',
                        provider_name: 'P',
                        api_identifier: 'mx',
                        created_at: '',
                        updated_at: '',
                        context_window_tokens: 1000,
                        input_token_cost_usd_millionths: 1,
                        output_token_cost_usd_millionths: 1,
                        max_output_tokens: 500,
                        is_active: true,
                        description: null,
                        strengths: null,
                        weaknesses: null,
                    },
                ],
            });
            const { setModelMultiplicity } = useDialecticStore.getState();
            setModelMultiplicity(modelX, 2);

            const state = useDialecticStore.getState();
            expect(state.selectedModels).toBeDefined();
            if (state.selectedModels) {
                expect(state.selectedModels).toHaveLength(2);
                expect(state.selectedModels[0].displayName).toBe('Model X Display');
                expect(state.selectedModels[1].displayName).toBe('Model X Display');
            }
        });
    });

    describe('reset action', () => {
        it('should reset the entire store to initialDialecticStateValues', () => {
            // Modify some state values
            useDialecticStore.setState({
                isLoadingProjects: true,
                projects: [{ 
                    id: '1',
                    project_name: 'Test Project',
                    selected_domain_id: 'test-domain',
                    dialectic_domains: {
                        name: 'Test Domain',
                    },
                    dialectic_process_templates: {
                        id: 'pt-1',
                        name: 'Mock Template',
                        description: 'A mock template',
                        created_at: new Date().toISOString(),
                        starting_stage_id: 'stage-1',
                        stages: [],
                    },
                    user_id: 'user-1',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    status: 'active',
                    initial_user_prompt: 'Test prompt',
                    initial_prompt_resource_id: null,
                    selected_domain_overlay_id: null,
                    repo_url: null,
                    process_template_id: 'pt-1',
                    isLoadingProcessTemplate: false,
                    processTemplateError: null,
                    contributionGenerationStatus: 'idle',
                    generateContributionsError: null,   
                    isSubmittingStageResponses: false,
                    submitStageResponsesError: null,
                    isSavingContributionEdit: false,
                    saveContributionEditError: null,
                }],
                selectedDomain: { 
                    id: 'test-domain',
                    name: 'Test Domain',
                    description: 'Test Domain Description',
                    parent_domain_id: null,
                    is_enabled: true,
                },
                activeSessionDetail: { 
                    id: 'session-reset-test',
                    project_id: '1',
                    current_stage_id: 'stage-1',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    selected_models: [],
                    dialectic_contributions: [],
                    feedback: [],
                    session_description: null,
                    user_input_reference_url: null,
                    iteration_count: 0,
                    status: 'active',
                    associated_chat_id: null,
                }, // Add a value for new field
            });

            let state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(true);
            expect(state.projects.length).toBe(1);
            expect(state.selectedDomain).not.toBeNull();
            expect(state.activeSessionDetail).not.toBeNull(); // Check new field

            // Call the reset action
            state.reset();
            state = useDialecticStore.getState(); // Re-fetch state after action

            // Check a few key properties to ensure they are reset
            expect(state.isLoadingProjects).toBe(initialDialecticStateValues.isLoadingProjects);
            expect(state.projects).toEqual(initialDialecticStateValues.projects);
            expect(state.selectedDomain).toBe(initialDialecticStateValues.selectedDomain);
            expect(state.activeSessionDetail).toBe(initialDialecticStateValues.activeSessionDetail); // Check new field is reset

            Object.keys(initialDialecticStateValues).forEach(key => {
                expect((state)[key]).toEqual((initialDialecticStateValues)[key]);
            });
        });
    });

    describe('Context Setter Actions', () => {
        it('setActiveContextProjectId should update activeContextProjectId', () => {
            const { setActiveContextProjectId } = useDialecticStore.getState();
            const testId = 'project-xyz';
            setActiveContextProjectId(testId);
            expect(useDialecticStore.getState().activeContextProjectId).toBe(testId);
            setActiveContextProjectId(null);
            expect(useDialecticStore.getState().activeContextProjectId).toBeNull();
        });

        it('setActiveContextSessionId should update activeContextSessionId', () => {
            const { setActiveContextSessionId } = useDialecticStore.getState();
            const testId = 'session-xyz';
            setActiveContextSessionId(testId);
            expect(useDialecticStore.getState().activeContextSessionId).toBe(testId);
            setActiveContextSessionId(null);
            expect(useDialecticStore.getState().activeContextSessionId).toBeNull();
        });

        it('setActiveContextStage should update activeContextStage', () => {
            const { setActiveContextStage } = useDialecticStore.getState();
            const testStage: DialecticStage = { 
                id: 'stage-1', 
                slug: 'test-stage', 
                description: 'Test stage description', 
                created_at: new Date().toISOString(), 
                display_name: 'Test Stage', 
                default_system_prompt_id: null, 
                expected_output_template_ids: [],
                recipe_template_id: null,
                active_recipe_instance_id: null,
            };
            setActiveContextStage(testStage);
            expect(useDialecticStore.getState().activeContextStage).toEqual(testStage);
            setActiveContextStage(null);
            expect(useDialecticStore.getState().activeContextStage).toBeNull();
        });

        it('setActiveDialecticContext should update all context fields', () => {
            const { setActiveDialecticContext } = useDialecticStore.getState();
            const testContext = {
                projectId: 'proj-ctx',
                sessionId: 'sess-ctx',
                stage: { 
                    id: 'stage-ctx', 
                    slug: 'ctx-stage',
                    description: 'Test context stage',
                    created_at: new Date().toISOString(),
                    display_name: 'Context Stage',
                    default_system_prompt_id: null,
                    expected_output_template_ids: [],
                    recipe_template_id: null,
                    active_recipe_instance_id: null,
                },
            };
            setActiveDialecticContext(testContext);
            const state = useDialecticStore.getState();
            expect(state.activeContextProjectId).toBe(testContext.projectId);
            expect(state.activeContextSessionId).toBe(testContext.sessionId);
            expect(state.activeContextStage).toEqual(testContext.stage);

            setActiveDialecticContext({ projectId: null, sessionId: null, stage: null });
            const clearedState = useDialecticStore.getState();
            expect(clearedState.activeContextProjectId).toBeNull();
            expect(clearedState.activeContextSessionId).toBeNull();
            expect(clearedState.activeContextStage).toBeNull();
        });
    });

    describe('Submission State Actions', () => {
        it('setSubmittingStageResponses should update isSubmittingStageResponses', () => {
            const { setSubmittingStageResponses } = useDialecticStore.getState();
            setSubmittingStageResponses(true);
            expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(true);
            setSubmittingStageResponses(false);
            expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
        });

        it('setSubmitStageResponsesError should update submitStageResponsesError', () => {
            const { setSubmitStageResponsesError } = useDialecticStore.getState();
            const testError: ApiError = { code: 'ERR', message: 'Test submit error' };
            setSubmitStageResponsesError(testError);
            expect(useDialecticStore.getState().submitStageResponsesError).toEqual(testError);
            setSubmitStageResponsesError(null);
            expect(useDialecticStore.getState().submitStageResponsesError).toBeNull();
        });

        it('resetSubmitStageResponsesError should set submitStageResponsesError to null', () => {
            useDialecticStore.setState({ submitStageResponsesError: { code: 'ERR', message: 'Initial error' }});
            const { resetSubmitStageResponsesError } = useDialecticStore.getState();
            resetSubmitStageResponsesError();
            expect(useDialecticStore.getState().submitStageResponsesError).toBeNull();
        });

        it('setSavingContributionEdit should update isSavingContributionEdit', () => {
            const { setSavingContributionEdit } = useDialecticStore.getState();
            setSavingContributionEdit(true);
            expect(useDialecticStore.getState().isSavingContributionEdit).toBe(true);
            setSavingContributionEdit(false);
            expect(useDialecticStore.getState().isSavingContributionEdit).toBe(false);
        });

        it('setSaveContributionEditError should update saveContributionEditError', () => {
            const { setSaveContributionEditError } = useDialecticStore.getState();
            const testError: ApiError = { code: 'SAVE_ERR', message: 'Test save error' };
            setSaveContributionEditError(testError);
            expect(useDialecticStore.getState().saveContributionEditError).toEqual(testError);
            setSaveContributionEditError(null);
            expect(useDialecticStore.getState().saveContributionEditError).toBeNull();
        });

        it('resetSaveContributionEditError should set saveContributionEditError to null', () => {
            useDialecticStore.setState({ saveContributionEditError: { code: 'SAVE_ERR', message: 'Initial save error' }});
            const { resetSaveContributionEditError } = useDialecticStore.getState();
            resetSaveContributionEditError();
            expect(useDialecticStore.getState().saveContributionEditError).toBeNull();
        });
    });

    describe('saveContributionEdit thunk', () => {
        const payload: SaveContributionEditPayload = {
            originalContributionIdToEdit: 'contrib-1',
            editedContentText: 'Edited content.',
            projectId: 'proj-1',
            sessionId: 'sess-1',
            originalModelContributionId: 'contrib-1',
            responseText: 'Edited content.',
            documentKey: 'feature_spec',
            resourceType: 'rendered_document',
        };

        const mockResource: EditedDocumentResource = {
            id: 'resource-1',
            resource_type: 'rendered_document',
            project_id: payload.projectId,
            session_id: payload.sessionId,
            stage_slug: 'thesis',
            iteration_number: 1,
            document_key: payload.documentKey,
            source_contribution_id: payload.originalContributionIdToEdit,
            storage_bucket: 'bucket',
            storage_path: 'path',
            file_name: 'file.md',
            mime_type: 'text/markdown',
            size_bytes: 100,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const mockSuccessResponse: ApiResponse<SaveContributionEditSuccessResponse> = {
            data: { resource: mockResource, sourceContributionId: payload.originalContributionIdToEdit },
            status: 201,
        };

        it('should call api.dialectic().saveContributionEdit with payload including documentKey and resourceType and return success', async () => {
            getMockDialecticClient().saveContributionEdit.mockResolvedValue(mockSuccessResponse);

            const { saveContributionEdit } = useDialecticStore.getState();
            const result = await saveContributionEdit(payload);

            expect(getMockDialecticClient().saveContributionEdit).toHaveBeenCalledWith(payload);
            expect(result.error).toBeUndefined();
            expect(result.status).toBe(201);
            expect(result.data?.resource.id).toBe(mockResource.id);
            const state = useDialecticStore.getState();
            expect(state.isSavingContributionEdit).toBe(false);
            expect(state.saveContributionEditError).toBeNull();
        });

        it('should set saveContributionEditError when API returns error', async () => {
            const mockError: ApiError = { code: 'SAVE_ERROR', message: 'Save failed' };
            getMockDialecticClient().saveContributionEdit.mockResolvedValue({ error: mockError, status: 500 });

            const { saveContributionEdit } = useDialecticStore.getState();
            const result = await saveContributionEdit(payload);

            expect(getMockDialecticClient().saveContributionEdit).toHaveBeenCalledWith(payload);
            expect(result.error).toEqual(mockError);
            const state = useDialecticStore.getState();
            expect(state.isSavingContributionEdit).toBe(false);
            expect(state.saveContributionEditError).toEqual(mockError);
        });

        it('should use payload.documentKey for stageDocumentContent composite key, not resource.document_key or originalContribution.contribution_type', async () => {
            const sessionId = 'sess-payload-key';
            const originalContributionIdToEdit = 'contrib-payload-key';
            const payloadDocumentKey = 'feature_spec';

            const originalContribution: DialecticContribution = {
                id: originalContributionIdToEdit,
                session_id: sessionId,
                user_id: 'user-1',
                stage: 'synthesis',
                iteration_number: 1,
                model_id: 'model-1',
                job_id: 'job-1',
                status: 'completed',
                original_model_contribution_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                model_name: 'Test Model',
                prompt_template_id_used: 'prompt-1',
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
                storage_bucket: 'bucket',
                storage_path: 'path',
                size_bytes: 100,
                mime_type: 'text/markdown',
            };

            const projectWithSession: DialecticProject = {
                id: 'proj-payload-key',
                user_id: 'user-1',
                project_name: 'Test',
                selected_domain_id: 'domain-1',
                dialectic_domains: { name: 'Domain' },
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
                dialectic_sessions: [{
                    id: sessionId,
                    dialectic_contributions: [originalContribution],
                    iteration_count: 1,
                    project_id: 'proj-payload-key',
                    session_description: 'Session',
                    user_input_reference_url: null,
                    selected_models: [],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    status: 'pending_hypothesis',
                    associated_chat_id: null,
                    current_stage_id: 'thesis',
                }],
            };

            const resourceWithDifferentDocumentKey: EditedDocumentResource = {
                id: 'resource-payload-key',
                resource_type: 'rendered_document',
                project_id: 'proj-payload-key',
                session_id: sessionId,
                stage_slug: 'synthesis',
                iteration_number: 1,
                document_key: 'other_key',
                source_contribution_id: originalContributionIdToEdit,
                storage_bucket: 'bucket',
                storage_path: 'path',
                file_name: 'file.md',
                mime_type: 'text/markdown',
                size_bytes: 100,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const payloadWithDocumentKey: SaveContributionEditPayload = {
                originalContributionIdToEdit,
                editedContentText: 'Edited by payload key test.',
                projectId: 'proj-payload-key',
                sessionId,
                originalModelContributionId: originalContributionIdToEdit,
                responseText: 'Edited by payload key test.',
                documentKey: payloadDocumentKey,
                resourceType: 'rendered_document',
            };

            getMockDialecticClient().saveContributionEdit.mockResolvedValue({
                data: { resource: resourceWithDifferentDocumentKey, sourceContributionId: originalContributionIdToEdit },
                status: 201,
            });

            useDialecticStore.setState({
                currentProjectDetail: projectWithSession,
                stageDocumentContent: {},
            });

            const { saveContributionEdit } = useDialecticStore.getState();
            await saveContributionEdit(payloadWithDocumentKey);

            const finalState = useDialecticStore.getState();
            const expectedKey = `${sessionId}:synthesis:1:model-1:${payloadDocumentKey}`;
            const documentEntry = finalState.stageDocumentContent[expectedKey];

            expect(documentEntry).toBeDefined();
            expect(documentEntry?.baselineMarkdown).toBe(payloadWithDocumentKey.editedContentText);
            expect(documentEntry?.currentDraftMarkdown).toBe(payloadWithDocumentKey.editedContentText);
        });
    });

    describe('submitStageResponses thunk', () => {
        const projectId = 'proj-submit';
        const sessionId = 'sess-submit';
        const stageSlug = 'thesis';
        const iterationNumber = 1;
        const modelId = 'model-1';
        const documentKey = 'doc_a';
        const serializedKey = `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;

        const mockProject: DialecticProject = {
            id: projectId,
            user_id: 'user-1',
            project_name: 'Submit Test Project',
            selected_domain_id: 'domain-1',
            dialectic_domains: { name: 'Domain' },
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
            dialectic_sessions: [{
                id: sessionId,
                dialectic_contributions: [],
                iteration_count: 1,
                project_id: projectId,
                session_description: 'Session',
                user_input_reference_url: null,
                selected_models: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'pending_antithesis',
                associated_chat_id: null,
                current_stage_id: stageSlug,
            }],
        };

        const payload: SubmitStageResponsesPayload = {
            projectId,
            sessionId,
            stageSlug,
            currentIterationNumber: iterationNumber,
        };

        it('submitStageResponses edit path reads content.sourceContributionId and content.resourceType and succeeds without stageDocumentResources', async () => {
            useDialecticStore.setState({
                currentProjectDetail: mockProject,
                stageDocumentContent: {
                    [serializedKey]: {
                        baselineMarkdown: 'Baseline',
                        currentDraftMarkdown: 'Edited content',
                        isDirty: true,
                        isLoading: false,
                        error: null,
                        lastBaselineVersion: null,
                        pendingDiff: 'Edited content',
                        lastAppliedVersionHash: null,
                        sourceContributionId: 'contrib-edit-1',
                        feedbackDraftMarkdown: '',
                        feedbackIsDirty: false,
                        resourceType: 'rendered_document',
                    },
                },
            });
            getMockDialecticClient().saveContributionEdit.mockResolvedValue({
                data: { resource: { id: 'res-1', resource_type: 'rendered_document', project_id: projectId, session_id: sessionId, stage_slug: stageSlug, iteration_number: iterationNumber, document_key: documentKey, source_contribution_id: 'contrib-edit-1', storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', mime_type: 'text/markdown', size_bytes: 1, created_at: '', updated_at: '' }, sourceContributionId: 'contrib-edit-1' },
                status: 201,
            });
            getMockDialecticClient().submitStageResponses.mockResolvedValue({ data: { updatedSession: mockProject.dialectic_sessions![0] }, status: 200 });
            getMockDialecticClient().getProjectDetails.mockResolvedValue({ data: mockProject, status: 200 });

            await useDialecticStore.getState().submitStageResponses(payload);

            expect(getMockDialecticClient().saveContributionEdit).toHaveBeenCalledWith(
                expect.objectContaining({
                    originalContributionIdToEdit: 'contrib-edit-1',
                    documentKey,
                    resourceType: 'rendered_document',
                    editedContentText: 'Edited content',
                }),
            );
            expect(useDialecticStore.getState().submitStageResponsesError).toBeNull();
        });

        it('submitStageResponses feedback path reads content.sourceContributionId and succeeds without prior save (load-only flow)', async () => {
            useAuthStore.setState({ user: { id: 'user-feedback-1' } });
            useDialecticStore.setState({
                currentProjectDetail: mockProject,
                stageDocumentContent: {
                    [serializedKey]: {
                        baselineMarkdown: 'Baseline',
                        currentDraftMarkdown: 'Baseline',
                        isDirty: false,
                        isLoading: false,
                        error: null,
                        lastBaselineVersion: null,
                        pendingDiff: null,
                        lastAppliedVersionHash: null,
                        sourceContributionId: 'contrib-load-only',
                        feedbackDraftMarkdown: 'Feedback text',
                        feedbackIsDirty: true,
                        resourceType: null,
                    },
                },
            });
            getMockDialecticClient().submitStageDocumentFeedback.mockResolvedValue({ data: { success: true }, status: 200 });
            getMockDialecticClient().submitStageResponses.mockResolvedValue({ data: { updatedSession: mockProject.dialectic_sessions![0] }, status: 200 });
            getMockDialecticClient().getProjectDetails.mockResolvedValue({ data: mockProject, status: 200 });

            await useDialecticStore.getState().submitStageResponses(payload);

            expect(getMockDialecticClient().submitStageDocumentFeedback).toHaveBeenCalledWith(
                expect.objectContaining({
                    sourceContributionId: 'contrib-load-only',
                    feedbackContent: 'Feedback text',
                    documentKey,
                }),
            );
            expect(useDialecticStore.getState().submitStageResponsesError).toBeNull();
        });

        it('submitStageResponses submits both dirty edit and dirty feedback for same key in a single call', async () => {
            useAuthStore.setState({ user: { id: 'user-both-1' } });
            useDialecticStore.setState({
                currentProjectDetail: mockProject,
                stageDocumentContent: {
                    [serializedKey]: {
                        baselineMarkdown: 'Baseline',
                        currentDraftMarkdown: 'Edited',
                        isDirty: true,
                        isLoading: false,
                        error: null,
                        lastBaselineVersion: null,
                        pendingDiff: 'Edited',
                        lastAppliedVersionHash: null,
                        sourceContributionId: 'contrib-both-1',
                        feedbackDraftMarkdown: 'Feedback',
                        feedbackIsDirty: true,
                        resourceType: 'rendered_document',
                    },
                },
            });
            getMockDialecticClient().saveContributionEdit.mockResolvedValue({
                data: { resource: { id: 'res-both', resource_type: 'rendered_document', project_id: projectId, session_id: sessionId, stage_slug: stageSlug, iteration_number: iterationNumber, document_key: documentKey, source_contribution_id: 'contrib-both-1', storage_bucket: 'b', storage_path: 'p', file_name: 'f.md', mime_type: 'text/markdown', size_bytes: 1, created_at: '', updated_at: '' }, sourceContributionId: 'contrib-both-1' },
                status: 201,
            });
            getMockDialecticClient().submitStageDocumentFeedback.mockResolvedValue({ data: { success: true }, status: 200 });
            getMockDialecticClient().submitStageResponses.mockResolvedValue({ data: { updatedSession: mockProject.dialectic_sessions![0] }, status: 200 });
            getMockDialecticClient().getProjectDetails.mockResolvedValue({ data: mockProject, status: 200 });

            await useDialecticStore.getState().submitStageResponses(payload);

            expect(getMockDialecticClient().saveContributionEdit).toHaveBeenCalledTimes(1);
            expect(getMockDialecticClient().submitStageDocumentFeedback).toHaveBeenCalledTimes(1);
            expect(useDialecticStore.getState().submitStageResponsesError).toBeNull();
        });
    });

    describe('fetchProcessTemplate thunk', () => {
        const mockTemplate: DialecticProcessTemplate = {
            id: 'pt1',
            name: 'Standard Dialectic',
            description: 'A standard template',
            created_at: new Date().toISOString(),
            starting_stage_id: 'stage-1',
            stages: [],
        };

        it('should fetch a process template and update state on success', async () => {
            const mockResponse: ApiResponse<DialecticProcessTemplate> = {
                data: mockTemplate,
                status: 200,
            };
            getMockDialecticClient().fetchProcessTemplate.mockResolvedValue(mockResponse);

            const { fetchProcessTemplate } = useDialecticStore.getState();
            await fetchProcessTemplate('pt1');

            const state = useDialecticStore.getState();
            expect(state.isLoadingProcessTemplate).toBe(false);
            expect(state.currentProcessTemplate).toEqual(mockTemplate);
            expect(state.processTemplateError).toBeNull();
        });

        it('should handle API errors when fetching a process template', async () => {
            const mockError: ApiError = { code: 'NOT_FOUND', message: 'Template not found' };
            const mockResponse: ApiResponse<DialecticProcessTemplate> = {
                error: mockError,
                status: 404,
            };
            getMockDialecticClient().fetchProcessTemplate.mockResolvedValue(mockResponse);

            const { fetchProcessTemplate } = useDialecticStore.getState();
            await fetchProcessTemplate('pt-nonexistent');

            const state = useDialecticStore.getState();
            expect(state.isLoadingProcessTemplate).toBe(false);
            expect(state.currentProcessTemplate).toBeNull();
            expect(state.processTemplateError).toEqual(mockError);
        });
    });

    describe('hydrateAllStageProgress thunk', () => {
        it('hydrateAllStageProgress action exists', () => {
            const state = useDialecticStore.getState();
            expect(typeof state.hydrateAllStageProgress).toBe('function');
        });

        it('hydrateAllStageProgress calls getAllStageProgress with payload', async () => {
            const payload: GetAllStageProgressPayload = {
                sessionId: 'session-1',
                iterationNumber: 1,
                userId: 'user-1',
                projectId: 'project-1',
            };
            getMockDialecticClient().getAllStageProgress.mockResolvedValue({
                data: [],
                status: 200,
            });

            const { hydrateAllStageProgress } = useDialecticStore.getState();
            await hydrateAllStageProgress(payload);

            expect(getMockDialecticClient().getAllStageProgress).toHaveBeenCalledTimes(1);
            expect(getMockDialecticClient().getAllStageProgress).toHaveBeenCalledWith(payload);
        });
    });

    describe('fetchDomains thunk', () => {
        const mockDomains: DialecticDomain[] = [
            { id: '1', name: 'Software Development', description: 'All about code', parent_domain_id: null, is_enabled: true },
            { id: '2', name: 'Finance', description: 'All about money', parent_domain_id: null, is_enabled: true },
        ];

        it('should fetch domains and update state on success', async () => {
            const mockResponse: ApiResponse<DialecticDomain[]> = {
                data: mockDomains,
                status: 200,
            };
            getMockDialecticClient().listDomains.mockResolvedValue(mockResponse);

            const fetchDomains = useDialecticStore.getState().fetchDomains;
            await fetchDomains();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomains).toBe(false);
            expect(state.domains).toEqual(mockDomains);
            expect(state.domainsError).toBeNull();
        });

        it('should handle API errors when fetching domains', async () => {
            const mockError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to fetch' };
            const mockResponse: ApiResponse<DialecticDomain[]> = {
                error: mockError,
                status: 500,
            };
            getMockDialecticClient().listDomains.mockResolvedValue(mockResponse);

            const fetchDomains = useDialecticStore.getState().fetchDomains;
            await fetchDomains();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomains).toBe(false);
            expect(state.domains).toEqual([]);
            expect(state.domainsError).toEqual(mockError);
        });
    });

    describe('createDialecticProject thunk', () => {
        const mockProject: DialecticProject = {
            id: 'proj-123',
            project_name: 'Test Project',
            selected_domain_id: 'domain-1',
            dialectic_domains: { name: 'Software Development' },
            user_id: 'user-123',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'active',
            initial_user_prompt: 'Test prompt',
            initial_prompt_resource_id: null,
            selected_domain_overlay_id: null,
            repo_url: null,
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

        const mockPayload: CreateProjectPayload = {
            projectName: 'Test Project',
            initialUserPrompt: 'Test prompt',
            selectedDomainId: 'domain-1',
        };

        it('should create a project and update state on success', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockProject,
                status: 201,
            };
            getMockDialecticClient().createProject.mockResolvedValue(mockResponse);
            getMockDialecticClient().listProjects.mockResolvedValue({
                data: [mockProject],
                status: 200,
            });

            const createProject = useDialecticStore.getState().createDialecticProject;
            const result = await createProject(mockPayload);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);
            expect(state.projects).toEqual([mockProject]);
            expect(state.currentProjectDetail).toEqual(mockProject);
            expect(state.createProjectError).toBeNull();
            expect(result.data).toEqual(mockProject);
            
            // Verify that api.dialectic().createProject was called with FormData
            const createProjectCall = getMockDialecticClient().createProject.mock.calls[0][0];
            expect(createProjectCall).toBeInstanceOf(FormData);
            // This now acts as a type guard for TypeScript
            if (createProjectCall instanceof FormData) {
                expect(createProjectCall.get('projectName')).toBe(mockPayload.projectName);
                expect(createProjectCall.get('initialUserPromptText')).toBe(mockPayload.initialUserPrompt);
                expect(createProjectCall.get('selectedDomainId')).toBe(mockPayload.selectedDomainId);
            }
        });

        it('should handle API errors when creating a project', async () => {
            const mockError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to create' };
            const mockResponse: ApiResponse<DialecticProject> = {
                error: mockError,
                status: 500,
            };
            getMockDialecticClient().createProject.mockResolvedValue(mockResponse);

            const createProject = useDialecticStore.getState().createDialecticProject;
            await createProject(mockPayload);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);
            expect(state.projects).toEqual([]);
            expect(state.createProjectError).toEqual(mockError);
        });

        it('should handle creating a project with a file', async () => {
            const mockFile = new File(['file content'], 'prompt.md', { type: 'text/markdown' });
            const payloadWithFile: CreateProjectPayload = {
                ...mockPayload,
                promptFile: mockFile,
            };
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockProject,
                status: 201,
            };
            getMockDialecticClient().createProject.mockResolvedValue(mockResponse);
            getMockDialecticClient().listProjects.mockResolvedValue({
                data: [mockProject],
                status: 200,
            });

            const createProject = useDialecticStore.getState().createDialecticProject;
            await createProject(payloadWithFile);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);

            const createProjectCall = getMockDialecticClient().createProject.mock.calls[0][0];
            expect(createProjectCall).toBeInstanceOf(FormData);
            if (createProjectCall instanceof FormData) {
                expect(createProjectCall.get('projectName')).toBe(payloadWithFile.projectName);
                expect(createProjectCall.get('initialUserPromptText')).toBe(payloadWithFile.initialUserPrompt);
                expect(createProjectCall.get('selectedDomainId')).toBe(payloadWithFile.selectedDomainId);
                expect(createProjectCall.get('promptFile')).toBe(mockFile);
            }
        });
    });

    describe('generateContributions action', () => {
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
                selected_models: [{ id: 'model-1', displayName: 'Test Model 1' }, { id: 'model-2', displayName: 'Test Model 2' }],
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
            // Add other required fields for DialecticProject
            initial_user_prompt: 'initial prompt',
            initial_prompt_resource_id: null,
            selected_domain_overlay_id: null,
            repo_url: null,
            process_template_id: null,
            dialectic_process_templates: null,
            isLoadingProcessTemplate: false,
            processTemplateError: null,
        };

        const mockModelCatalog: AIModelCatalogEntry[] = [
            { id: 'model-1', model_name: 'Test Model 1', provider_name: 'Provider A', api_identifier: 'm1', created_at: '', updated_at: '', context_window_tokens: 1000, input_token_cost_usd_millionths: 1, output_token_cost_usd_millionths: 1, max_output_tokens: 500, is_active: true, description: null, strengths: null, weaknesses: null },
            { id: 'model-2', model_name: 'Test Model 2', provider_name: 'Provider B', api_identifier: 'm2', created_at: '', updated_at: '', context_window_tokens: 1000, input_token_cost_usd_millionths: 1, output_token_cost_usd_millionths: 1, max_output_tokens: 500, is_active: true, description: null, strengths: null, weaknesses: null },
        ];


        const selectedModelsForGeneration: SelectedModels[] = [
            { id: 'model-1', displayName: 'Test Model 1' },
            { id: 'model-2', displayName: 'Test Model 2' },
        ];

        beforeEach(() => {
            useDialecticStore.setState({ 
                currentProjectDetail: JSON.parse(JSON.stringify(mockProject)),
                selectedModels: selectedModelsForGeneration,
                modelCatalog: mockModelCatalog,
            });
        });

        it('should handle successful contribution generation request and create placeholders with job_ids', async () => {
            const mockResponse: GenerateContributionsResponse = {
                sessionId: mockPayload.sessionId,
                projectId: mockPayload.projectId,
                stage: mockPayload.stageSlug,
                iteration: mockPayload.iterationNumber,
                status: 'pending',
                job_ids: ['job-1', 'job-2'],
                successfulContributions: [],
                failedAttempts: [],
            };
            getMockDialecticClient().generateContributions.mockResolvedValue({
                data: mockResponse,
                status: 202,
            });

            const { generateContributions } = useDialecticStore.getState();
            
            // --- Check initial state ---
            const initialState = useDialecticStore.getState();
            const initialContributions = initialState.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
            expect(initialContributions).toHaveLength(0);

            await generateContributions(mockPayload);

            const finalState = useDialecticStore.getState();
            const finalContributions = finalState.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
            
            // --- Assertions ---
            expect(finalState.contributionGenerationStatus).toBe('generating');
            expect(finalState.generateContributionsError).toBeNull();
            expect(finalContributions).toHaveLength(2);
            expect(finalContributions?.[0].status).toBe('pending');
            expect(finalContributions?.[0].job_id).toBe('job-1');
            expect(finalContributions?.[1].model_name).toBe('Test Model 2');
            expect(finalContributions?.[1].job_id).toBe('job-2');
            expect(finalState.generatingSessions[mockPayload.sessionId]).toEqual(['job-1', 'job-2']);
        });

        it('should create placeholders immediately and handle API response', async () => {
            getMockDialecticClient().generateContributions.mockResolvedValue({
                data: { 
                    job_ids: ['job-abc'],
                    sessionId: mockPayload.sessionId,
                    projectId: mockPayload.projectId,
                    stage: mockPayload.stageSlug,
                    iteration: mockPayload.iterationNumber,
                    status: 'pending',
                    successfulContributions: [],
                    failedAttempts: [],
                },
                status: 202,
            });

            const { generateContributions } = useDialecticStore.getState();
            
            // --- Action ---
            generateContributions(mockPayload); // Don't await, check immediate state change

            // --- Assertions for immediate state change ---
            const stateAfterCall = useDialecticStore.getState();
            expect(stateAfterCall.contributionGenerationStatus).toBe('generating');
            const contributions = stateAfterCall.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
            expect(contributions).toHaveLength(2);
            expect(contributions?.[0].status).toBe('pending');
        });

        it('should handle API error during contribution generation and mark placeholders as failed', async () => {
            const mockApiError: ApiError = { code: 'SERVER_ERROR', message: 'Generation failed' };
            getMockDialecticClient().generateContributions.mockResolvedValue({
                error: mockApiError,
                status: 500,
            });

            const { generateContributions } = useDialecticStore.getState();
            await generateContributions(mockPayload);

            const finalState = useDialecticStore.getState();
            const finalContributions = finalState.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;

            expect(finalState.contributionGenerationStatus).toBe('failed');
            expect(finalState.generateContributionsError).toEqual(mockApiError);
            expect(finalContributions).toHaveLength(2);
            expect(finalContributions?.[0].status).toBe('failed');
            expect(finalContributions?.[1].status).toBe('failed');
        });

        it('should handle network error during contribution generation and mark placeholders as failed', async () => {
            const networkError = new Error('Network connection lost');
            getMockDialecticClient().generateContributions.mockRejectedValue(networkError);

            const { generateContributions } = useDialecticStore.getState();
            await generateContributions(mockPayload);

            const finalState = useDialecticStore.getState();
            const finalContributions = finalState.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;

            expect(finalState.contributionGenerationStatus).toBe('failed');
            expect(finalState.generateContributionsError).toEqual({ message: networkError.message, code: 'NETWORK_ERROR' });
            expect(finalContributions).toHaveLength(2);
            expect(finalContributions?.[0].status).toBe('failed');
            expect(finalContributions?.[1].status).toBe('failed');
        });

        it('should return error and add no placeholders when a selected model is missing from modelCatalog', async () => {
            const catalogWithOnlyModel1: AIModelCatalogEntry[] = [
                { id: 'model-1', model_name: 'Test Model 1', provider_name: 'Provider A', api_identifier: 'm1', created_at: '', updated_at: '', context_window_tokens: 1000, input_token_cost_usd_millionths: 1, output_token_cost_usd_millionths: 1, max_output_tokens: 500, is_active: true, description: null, strengths: null, weaknesses: null },
            ];
            useDialecticStore.setState({ modelCatalog: catalogWithOnlyModel1 });

            const { generateContributions } = useDialecticStore.getState();
            const result = await generateContributions(mockPayload);

            expect(result.error).toEqual({ message: 'Model details not found for model ID.', code: 'MODEL_DETAILS_NOT_FOUND' });
            expect(result.status).toBe(500);

            const finalState = useDialecticStore.getState();
            const finalContributions = finalState.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
            expect(finalContributions).toHaveLength(0);
            expect(finalState.generateContributionsError).toEqual(result.error);
            expect(getMockDialecticClient().generateContributions).not.toHaveBeenCalled();
        });

        it('should return error and add no placeholders when modelCatalog has model but model_name is empty', async () => {
            const catalogWithEmptyModelName: AIModelCatalogEntry[] = [
                { id: 'model-1', model_name: 'Test Model 1', provider_name: 'Provider A', api_identifier: 'm1', created_at: '', updated_at: '', context_window_tokens: 1000, input_token_cost_usd_millionths: 1, output_token_cost_usd_millionths: 1, max_output_tokens: 500, is_active: true, description: null, strengths: null, weaknesses: null },
                { id: 'model-2', model_name: '', provider_name: 'Provider B', api_identifier: 'm2', created_at: '', updated_at: '', context_window_tokens: 1000, input_token_cost_usd_millionths: 1, output_token_cost_usd_millionths: 1, max_output_tokens: 500, is_active: true, description: null, strengths: null, weaknesses: null },
            ];
            useDialecticStore.setState({ modelCatalog: catalogWithEmptyModelName });

            const { generateContributions } = useDialecticStore.getState();
            const result = await generateContributions(mockPayload);

            expect(result.error).toEqual({ message: 'Model name not found for model ID.', code: 'MODEL_NAME_NOT_FOUND' });
            expect(result.status).toBe(500);

            const finalState = useDialecticStore.getState();
            const finalContributions = finalState.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
            expect(finalContributions).toHaveLength(0);
            expect(finalState.generateContributionsError).toEqual(result.error);
            expect(getMockDialecticClient().generateContributions).not.toHaveBeenCalled();
        });
    });

    describe('clearFocusedStageDocument', () => {
        it('clears only the targeted document draft when focus is lost (progress.documents keyed by composite key)', () => {
            const firstKey: StageDocumentCompositeKey = {
                sessionId: 's1',
                stageSlug: 'thesis',
                iterationNumber: 1,
                modelId: 'model-1',
                documentKey: 'doc_a',
            };
            const secondKey: StageDocumentCompositeKey = {
                sessionId: 's1',
                stageSlug: 'thesis',
                iterationNumber: 1,
                modelId: 'model-2',
                documentKey: 'doc_b',
            };
            const firstSerialized = getStageDocumentKey(firstKey);
            const secondSerialized = getStageDocumentKey(secondKey);
            const firstFocusKey = 's1:thesis:model-1';
            const secondFocusKey = 's1:thesis:model-2';

            useDialecticStore.setState({
                stageDocumentContent: {
                    [firstSerialized]: {
                        baselineMarkdown: 'Doc A baseline',
                        currentDraftMarkdown: 'Doc A baseline\nSome edits for A',
                        isDirty: true,
                        isLoading: false,
                        error: null,
                        lastBaselineVersion: {
                            resourceId: 'res-a',
                            versionHash: 'a1',
                            updatedAt: new Date().toISOString(),
                        },
                        pendingDiff: 'Some edits for A',
                        lastAppliedVersionHash: 'a1',
                        sourceContributionId: null,
                        feedbackDraftMarkdown: '',
                        feedbackIsDirty: false,
                        resourceType: null,
                    },
                    [secondSerialized]: {
                        baselineMarkdown: 'Doc B baseline',
                        currentDraftMarkdown: 'Doc B baseline\nSome edits for B',
                        isDirty: true,
                        isLoading: false,
                        error: null,
                        lastBaselineVersion: {
                            resourceId: 'res-b',
                            versionHash: 'b1',
                            updatedAt: new Date().toISOString(),
                        },
                        pendingDiff: 'Some edits for B',
                        lastAppliedVersionHash: 'b1',
                        sourceContributionId: null,
                        feedbackDraftMarkdown: '',
                        feedbackIsDirty: false,
                        resourceType: null,
                    },
                },
                focusedStageDocument: {
                    [firstFocusKey]: { modelId: 'model-1', documentKey: 'doc_a' },
                    [secondFocusKey]: { modelId: 'model-2', documentKey: 'doc_b' },
                },
                stageRunProgress: {
                    's1:thesis:1': {
                        documents: {
                            [getStageRunDocumentKey('doc_a', 'model-1')]: {
                                status: 'completed',
                                job_id: 'job-a',
                                latestRenderedResourceId: 'res-a',
                                modelId: 'model-1',
                                versionHash: 'a1',
                                lastRenderedResourceId: 'res-a',
                                lastRenderAtIso: new Date().toISOString(),
                            },
                        },
                        stepStatuses: {},
                        jobProgress: {},
                    },
                },
            });

            useDialecticStore.getState().clearFocusedStageDocument({
                sessionId: 's1',
                stageSlug: 'thesis',
                modelId: 'model-1',
            });

            const state = useDialecticStore.getState();
            expect(state.focusedStageDocument[firstFocusKey]).toBeNull();
            expect(state.stageDocumentContent[firstSerialized]).toBeUndefined();
            expect(state.focusedStageDocument[secondFocusKey]).toBeDefined();
            expect(state.stageDocumentContent[secondSerialized]).toBeDefined();
        });
    });

    describe('activateProjectAndSessionContextForDeepLink', () => {
        const mockProjectId = 'proj-1';
        const mockSessionId = 'session-2';
        
        const mockProject: DialecticProject = {
            id: mockProjectId,
            project_name: 'Deep Link Project',
            selected_domain_id: 'domain-1',
            user_id: 'user-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'active',
            initial_user_prompt: 'Test prompt',
            initial_prompt_resource_id: null,
            selected_domain_overlay_id: null,
            repo_url: null,
            process_template_id: 'pt-1',
            dialectic_domains: {
                name: 'Software'
            },
            dialectic_process_templates: {
                id: 'pt-1',
                name: 'Mock Template',
                description: 'A mock template',
                created_at: new Date().toISOString(),
                starting_stage_id: 'stage-1',
                stages: [{ 
                    id: 'stage-1', 
                    slug: 'thesis', 
                    description: 'desc', 
                    created_at: new Date().toISOString(), 
                    display_name: 'Thesis', 
                    default_system_prompt_id: null, 
                    expected_output_template_ids: [],
                    recipe_template_id: null,
                    active_recipe_instance_id: null,
                }]
            },
            dialectic_sessions: [{ 
                id: 'session-1', 
                project_id: mockProjectId, 
                created_at: new Date().toISOString(), 
                updated_at: new Date().toISOString(), 
                current_stage_id: 'stage-1', 
                selected_models: [], 
                dialectic_contributions: [], 
                feedback: [], 
                session_description: null, 
                user_input_reference_url: null, 
                iteration_count: 0, 
                status: 'active', 
                associated_chat_id: null,
                dialectic_session_models: [],
                },
                { 
                id: mockSessionId, 
                project_id: mockProjectId, 
                created_at: new Date().toISOString(), 
                updated_at: new Date().toISOString(), 
                current_stage_id: 'stage-1', 
                selected_models: [], 
                dialectic_contributions: [], 
                feedback: [], 
                session_description: null, 
                user_input_reference_url: null, 
                iteration_count: 0, 
                status: 'active', 
                associated_chat_id: null,
                dialectic_session_models: [], 
            }
            ],
            contributionGenerationStatus: 'idle',
            generateContributionsError: null,
            isLoadingProcessTemplate: false,
            isSavingContributionEdit: false,
            isSubmittingStageResponses: false,
            processTemplateError: null,
            saveContributionEditError: null,
            submitStageResponsesError: null
        };

        const mockSession: DialecticSession = {
            id: mockSessionId,
            project_id: mockProjectId,
            current_stage_id: 'stage-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            selected_models: [],
            dialectic_contributions: [],
            feedback: [],
            session_description: null,
            user_input_reference_url: null,
            iteration_count: 0,
            status: 'active',
            associated_chat_id: null,
            dialectic_session_models: [],
        };

        const mockStage: DialecticStage = {
            id: 'stage-1',
            slug: 'thesis',
            description: 'desc',
            created_at: new Date().toISOString(),
            display_name: 'Thesis',
            default_system_prompt_id: null,
            expected_output_template_ids: [],
            recipe_template_id: null,
            active_recipe_instance_id: null,
        };

        it('should fetch project, then session, and set all context', async () => {
            // Arrange
            getMockDialecticClient().getProjectDetails.mockResolvedValue({
                data: mockProject,
                status: 200,
            });

            getMockDialecticClient().getSessionDetails.mockResolvedValue({
                data: {
                    session: mockSession,
                    currentStageDetails: mockStage,
                    activeSeedPrompt: null,
                },
                status: 200,
            });
            
            // Mock the template fetch that is triggered by getting project details
            getMockDialecticClient().fetchProcessTemplate.mockResolvedValue({
                data: mockProject.dialectic_process_templates ?? undefined,
                status: 200,
            });
            getMockDialecticClient().updateSessionModels.mockResolvedValue({
                data: mockSession,
                status: 200,
            });

            // Act
            const { activateProjectAndSessionContextForDeepLink } = useDialecticStore.getState();
            await activateProjectAndSessionContextForDeepLink(mockProjectId, mockSessionId);

            // Assert
            const state = useDialecticStore.getState();
            expect(getMockDialecticClient().getProjectDetails).toHaveBeenCalledWith(mockProjectId);
            expect(getMockDialecticClient().getSessionDetails).toHaveBeenCalledWith(mockSessionId, false);

            expect(state.currentProjectDetail).toEqual(mockProject);
            expect(state.activeSessionDetail).toEqual(expect.objectContaining(mockSession));
            expect(state.activeContextProjectId).toBe(mockProjectId);
            expect(state.activeContextSessionId).toBe(mockSessionId);
            expect(state.activeContextStage).toEqual(mockStage);
            expect(state.activeStageSlug).toBe(mockStage.slug);
        });

        it('should set projectDetailError on failure', async () => {
            const mockError: ApiError = { code: 'NOT_FOUND', message: 'Project not found' };
            getMockDialecticClient().getProjectDetails.mockResolvedValue({ error: mockError, status: 404 });

            const { activateProjectAndSessionContextForDeepLink } = useDialecticStore.getState();
            await activateProjectAndSessionContextForDeepLink(mockProjectId, mockSessionId);

            const state = useDialecticStore.getState();
            expect(state.projectDetailError).toEqual(mockError);
            expect(getMockDialecticClient().getSessionDetails).not.toHaveBeenCalled(); // Should not proceed if project fetch fails
        });
    });

    describe('_handleDialecticLifecycleEvent', () => {
        beforeEach(() => {
            // Setup initial state with a project and session
            useDialecticStore.setState({
                currentProjectDetail: {
                    id: 'proj-123',
                    dialectic_sessions: [{
                        id: 'session-123',
                        dialectic_contributions: [],
                        project_id: 'proj-123',
                        current_stage_id: 'stage-1',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        selected_models: [],
                        feedback: [],
                        session_description: null,
                        user_input_reference_url: null,
                        iteration_count: 0,
                        status: 'active',
                        associated_chat_id: null,
                    }],
                    project_name: 'Test Project',
                    selected_domain_id: 'domain-1',
                    dialectic_domains: { name: 'Software' },
                    user_id: 'user-123',
                    created_at: '2025-01-01T00:00:00Z',
                    updated_at: '2025-01-01T00:00:00Z',
                    status: 'active',
                    initial_user_prompt: 'Test prompt',
                    initial_prompt_resource_id: null,
                    selected_domain_overlay_id: null,
                    repo_url: null,
                    process_template_id: 'pt-1',
                    dialectic_process_templates: null,
                    isLoadingProcessTemplate: false,
                    processTemplateError: null,
                    contributionGenerationStatus: 'idle',
                    generateContributionsError: null,
                    isSubmittingStageResponses: false,
                    submitStageResponsesError: null,
                    isSavingContributionEdit: false,
                    saveContributionEditError: null,
                }
            });
        });

        it('should handle contribution_generation_started', () => {
            const event: DialecticLifecycleEvent = {
                type: 'contribution_generation_started',
                sessionId: 'session-123',
                modelId: 'model-abc',
                iterationNumber: 1,
                job_id: 'job-1'
            };
            useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);
    
          const state = useDialecticStore.getState();
          expect(state.contributionGenerationStatus).toBe('generating');
          expect(state.generateContributionsError).toBeNull();
        });

        it('should handle dialectic_contribution_started', () => {
            const placeholderId = `placeholder-session-123-model-abc-1`;
            // Add a placeholder contribution
            useDialecticStore.setState(state => {
                if (state.currentProjectDetail?.dialectic_sessions?.[0]) {
                    state.currentProjectDetail.dialectic_sessions[0].dialectic_contributions = [{ 
                        id: placeholderId, 
                        job_id: 'job-1', // Add the job_id to the placeholder
                        status: 'pending', 
                        session_id: 'session-123', 
                        iteration_number: 1, 
                        model_id: 'model-abc', 
                        model_name: 'model-abc',
                        stage: 'stage-1',
                        // Minimal required fields for a placeholder
                        user_id: null,
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
                    }];
                }
                return state;
            });

            const event: DialecticLifecycleEvent = {
                type: 'dialectic_contribution_started',
                sessionId: 'session-123',
                modelId: 'model-abc',
                iterationNumber: 1,
                job_id: 'job-1'
            };
            useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);

            const contribution = useDialecticStore.getState().currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions?.[0];
            expect(contribution?.status).toBe('generating');
        });

        it('should handle contribution_generation_retrying', () => {
            const placeholderId = `placeholder-session-123-model-abc-1`;
            // Add a placeholder contribution
            useDialecticStore.setState(state => {
                if (state.currentProjectDetail?.dialectic_sessions?.[0]) {
                    state.currentProjectDetail.dialectic_sessions[0].dialectic_contributions = [{ 
                        id: placeholderId, 
                        job_id: 'job-xyz', // Add the job_id to the placeholder
                        status: 'generating', // Should be in generating state before retrying
                        session_id: 'session-123', 
                        iteration_number: 1, 
                        model_id: 'model-abc', 
                        model_name: 'model-abc',
                        stage: 'stage-1',
                        // Minimal required fields for a placeholder
                        user_id: null,
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
                    }];
                }
                return state;
            });

            const event: DialecticLifecycleEvent = {
                type: 'contribution_generation_retrying',
                sessionId: 'session-123',
                modelId: 'model-abc',
                iterationNumber: 1,
                job_id: 'job-xyz',
                error: 'Retrying...',
            };
            useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);

            const contribution = useDialecticStore.getState().currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions?.[0];
            expect(contribution?.status).toBe('retrying');
            expect(contribution?.error).toEqual({
                message: 'Retrying...',
                code: 'CONTRIBUTION_RETRYING'
            });
        });

        it('should handle dialectic_contribution_received and replace placeholder by job_id', () => {
            const placeholderId = `placeholder-session-123-model-abc-1`;
            useDialecticStore.setState(state => {
                if (state.currentProjectDetail?.dialectic_sessions?.[0]) {
                    state.currentProjectDetail.dialectic_sessions[0].dialectic_contributions = [{ 
                        id: placeholderId,
                        job_id: 'job-to-find', // The key change: placeholder has a job_id
                        status: 'generating',
                        session_id: 'session-123',
                        iteration_number: 1,
                        model_id: 'model-abc',
                        model_name: 'model-abc',
                        stage: 'stage-1',
                        user_id: null,
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
                    }];
                }
                return state;
            });
            const event: DialecticLifecycleEvent = {
                type: 'dialectic_contribution_received',
                sessionId: 'session-123',
                contribution: { 
                    id: 'real-id-1', 
                    model_id: 'model-abc', // model_id is still present
                    iteration_number: 1, 
                    session_id: 'session-123', 
                    user_id: 'user-123', 
                    stage: 'stage-1', 
                    model_name: 'model-abc',
                    prompt_template_id_used: 'pt-1',
                    seed_prompt_url: 'https://example.com/seed',
                    edit_version: 1,
                    is_latest_edit: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    original_model_contribution_id: 'model-abc-1-0',
                    raw_response_storage_path: 'https://example.com/raw-response',
                    target_contribution_id: 'model-abc-1-0',
                    tokens_used_input: 100,
                    tokens_used_output: 100,
                    processing_time_ms: 1000,
                    error: null,
                    citations: [],
                    contribution_type: 'text',
                    file_name: 'contribution.txt',
                    storage_bucket: 'test-bucket',
                    storage_path: 'https://example.com/contribution.txt',
                    size_bytes: 100,    
                    mime_type: 'text/plain',
                },
                job_id: 'job-to-find', // The event carries the job_id
                is_continuing: false, // Explicitly add the missing flag
            };
            useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);

            const contributions = useDialecticStore.getState().currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
            expect(contributions).toHaveLength(1);
            expect(contributions?.[0].id).toBe('real-id-1');
            expect(contributions?.[0].status).toBe('completed');
        });

        it('should handle contribution_generation_continued and update placeholder by job_id', () => {
            const placeholderId = `placeholder-session-123-model-abc-1`;
            useDialecticStore.setState(state => {
                if (state.currentProjectDetail?.dialectic_sessions?.[0]) {
                    state.currentProjectDetail.dialectic_sessions[0].dialectic_contributions = [{
                        id: placeholderId,
                        job_id: 'job-to-continue', // The key change: placeholder has a job_id
                        status: 'generating',
                        session_id: 'session-123',
                        iteration_number: 1,
                        model_id: 'model-abc',
                        model_name: 'model-abc',
                        stage: 'stage-1',
                        user_id: null, prompt_template_id_used: null, seed_prompt_url: null, edit_version: 0, is_latest_edit: true, original_model_contribution_id: null, raw_response_storage_path: null, target_contribution_id: null, tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), contribution_type: null, file_name: null, storage_bucket: null, storage_path: null, size_bytes: null, mime_type: null,
                    }];
                }
                return state;
            });

            const event: DialecticLifecycleEvent = {
                type: 'contribution_generation_continued',
                sessionId: 'session-123',
                contribution: { 
                    id: 'real-id-1-part-1', 
                    model_id: 'model-abc', 
                    iteration_number: 1, 
                    session_id: 'session-123', 
                    status: 'continuing',
                    model_name: 'model-abc',
                    stage: 'stage-1',
                    user_id: 'user-123', 
                    prompt_template_id_used: 'pt-1', 
                    seed_prompt_url: 'url', 
                    edit_version: 1, 
                    is_latest_edit: true, 
                    original_model_contribution_id: 'real-id-1', 
                    raw_response_storage_path: 'path', 
                    target_contribution_id: 'real-id-1', 
                    tokens_used_input: 10, 
                    tokens_used_output: 20, 
                    processing_time_ms: 100, 
                    error: null, 
                    citations: [], 
                    created_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString(), 
                    contribution_type: 'text', 
                    file_name: 'file.txt', 
                    storage_bucket: 'b',
                    storage_path: 'p', 
                    size_bytes: 100, 
                    mime_type: 'text/plain',
                },
                job_id: 'job-to-continue',
                projectId: 'proj-123',
                modelId: 'model-abc',
                continuationNumber: 1,
            };

            useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);
            
            const contributions = useDialecticStore.getState().currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions;
            expect(contributions).toHaveLength(1);
            const contribution = contributions?.[0];
            expect(contribution?.id).toBe('real-id-1-part-1');
            expect(contribution?.status).toBe('continuing');
        });

        it('should handle contribution_generation_failed and update placeholder by job_id', () => {
            const placeholderId = `placeholder-session-123-model-abc-1`;
            useDialecticStore.setState(state => {
                if (state.currentProjectDetail?.dialectic_sessions?.[0]) {
                    state.currentProjectDetail.dialectic_sessions[0].dialectic_contributions = [{ 
                        id: placeholderId,
                        job_id: 'job-to-fail', // The key change: placeholder has a job_id
                        status: 'generating',
                        session_id: 'session-123',
                        iteration_number: 1,
                        model_id: 'model-abc',
                        model_name: 'model-abc',
                        stage: 'stage-1',
                        user_id: null, prompt_template_id_used: null, seed_prompt_url: null, edit_version: 0, is_latest_edit: true, original_model_contribution_id: null, raw_response_storage_path: null, target_contribution_id: null, tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), contribution_type: null, file_name: null, storage_bucket: null, storage_path: null, size_bytes: null, mime_type: null,
                    }];
                }
                return state;
            });

            const event: DialecticLifecycleEvent = {
                type: 'contribution_generation_failed',
                sessionId: 'session-123',
                modelId: 'model-abc', // A failed event can be model-specific
                job_id: 'job-to-fail', // The event carries the job_id
                error: { code: 'FAILED', message: 'It failed' },
            };
            useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);

            const contribution = useDialecticStore.getState().currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions?.[0];
            expect(contribution?.status).toBe('failed');
            expect(contribution?.error).toEqual({ code: 'FAILED', message: 'It failed' });
            // Overall status should not be 'failed' for a single model failure, just the placeholder
            expect(useDialecticStore.getState().contributionGenerationStatus).not.toBe('failed');
        });

        it('should handle contribution_generation_complete and reset status', () => {
            useDialecticStore.setState({ 
                contributionGenerationStatus: 'generating',
                generatingSessions: { 'session-123': ['job-1'] }
            });

            const event: DialecticLifecycleEvent = {
                type: 'contribution_generation_complete',
                sessionId: 'session-123',
                projectId: 'proj-1',
            };
            useDialecticStore.getState()._handleDialecticLifecycleEvent?.(event);
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('idle');
            expect(useDialecticStore.getState().generatingSessions['session-123']).toBeUndefined();
            expect(getMockDialecticClient().getProjectDetails).toHaveBeenCalledWith('proj-1');
        });
    });

	describe('exportDialecticProject action', () => {
		it('returns export_url and file_name unchanged on success', async () => {
			const projectId = 'proj-export-1';
			const payload = { projectId };
			const responseData = { export_url: 'https://cdn.example.com/signed/export.zip', file_name: 'project_export_proj-export-1.zip' };
			getMockDialecticClient().exportProject.mockResolvedValue({ status: 200, data: responseData });

			const { exportDialecticProject } = useDialecticStore.getState();
			const result = await exportDialecticProject(projectId);

			expect(getMockDialecticClient().exportProject).toHaveBeenCalledWith(payload);
			expect(result.status).toBe(200);
			expect(result.data).toEqual(responseData);
			expect(useDialecticStore.getState().exportProjectError).toBeNull();
		});

		it('surfaces error and sets exportProjectError when backend omits file_name (no defaults)', async () => {
			const projectId = 'proj-export-missing-file-name';
			// Backend incorrectly returns success without file_name
			getMockDialecticClient().exportProject.mockResolvedValue({ status: 200, data: { export_url: 'https://cdn.example.com/signed/export.zip' } });

			const { exportDialecticProject } = useDialecticStore.getState();
			const result = await exportDialecticProject(projectId);

			// Store must convert to error and not pass through a synthesized filename
			expect(result.error).toBeDefined();
			expect(result.status).not.toBe(200);
			expect(useDialecticStore.getState().exportProjectError).not.toBeNull();
		});

		it('propagates backend error and sets exportProjectError', async () => {
			const projectId = 'proj-export-error';
			const apiError = { code: 'EXPORT_FAILED', message: 'Failed to export' };
			getMockDialecticClient().exportProject.mockResolvedValue({ status: 500, error: apiError });

			const { exportDialecticProject } = useDialecticStore.getState();
			const result = await exportDialecticProject(projectId);

			expect(result.status).toBe(500);
			expect(result.error).toEqual(apiError);
			expect(useDialecticStore.getState().exportProjectError).toEqual(apiError);
		});
	});
}); 