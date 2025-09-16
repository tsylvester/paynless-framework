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
} from '@paynless/types';

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

    describe('resetSelectedModelId action', () => {
        it('should set selectedModelIds to an empty array', () => {
            // Set an initial state for selectedModelIds
            useDialecticStore.setState({ selectedModelIds: ['model-1', 'model-2'] });
            let state = useDialecticStore.getState();
            expect(state.selectedModelIds).not.toEqual([]);

            // Call the reset action
            state.resetSelectedModelId();
            state = useDialecticStore.getState(); // Re-fetch state after action
            expect(state.selectedModelIds).toEqual([]);
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
                    selected_model_ids: [],
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
                expected_output_artifacts: {}, 
                input_artifact_rules: {} 
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
                    expected_output_artifacts: {},
                    input_artifact_rules: {}
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


        beforeEach(() => {
            // Set the essential state needed for the action to run
            useDialecticStore.setState({ 
                currentProjectDetail: JSON.parse(JSON.stringify(mockProject)),
                selectedModelIds: ['model-1', 'model-2'],
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
                    expected_output_artifacts: {}, 
                    input_artifact_rules: {} 
                }]
            },
            dialectic_sessions: [{ 
                id: 'session-1', 
                project_id: mockProjectId, 
                created_at: new Date().toISOString(), 
                updated_at: new Date().toISOString(), 
                current_stage_id: 'stage-1', 
                selected_model_ids: [], 
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
                selected_model_ids: [], 
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
            selected_model_ids: [],
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
            expected_output_artifacts: {},
            input_artifact_rules: {}
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
            expect(getMockDialecticClient().getSessionDetails).toHaveBeenCalledWith(mockSessionId);

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
                        selected_model_ids: [],
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