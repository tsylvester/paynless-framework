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
} from '@paynless/types';

// Add the mock call here
vi.mock('@paynless/api', async (importOriginal) => {
    const original = await importOriginal() as Record<string, unknown>;
    // Import the parts of the mock we need
    const { api } = await import('@paynless/api/mocks'); 
    
    return {
        ...original, // Spread original to keep any non-mocked exports
        api, // Provide the mocked api object
        initializeApiClient: vi.fn(), 
        // Provide a mock for initializeApiClient
        // No need to re-import getMockDialecticClient or resetApiMock here as they are test utilities,
        // not part of the @paynless/api module's public interface used by the store.
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
                projects: [{ id: '1' } as any],
                selectedDomain: { id: 'test-domain' } as any,
                activeSessionDetail: { id: 'session-reset-test' } as any, // Add a value for new field
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
                expect((state as any)[key]).toEqual((initialDialecticStateValues as any)[key]);
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
            const testStage = { id: 'stage-1', slug: 'test-stage' } as DialecticStage;
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
                stage: { id: 'stage-ctx', slug: 'ctx-stage' } as DialecticStage,
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
            { id: '1', name: 'Software Development', description: 'All about code', parent_domain_id: null },
            { id: '2', name: 'Finance', description: 'All about money', parent_domain_id: null },
        ];

        it('should fetch domains and update state on success', async () => {
            const mockResponse: ApiResponse<DialecticDomain[]> = {
                data: mockDomains,
                status: 200,
            };
            (api.dialectic().listDomains as Mock).mockResolvedValue(mockResponse);

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
            (api.dialectic().listDomains as Mock).mockResolvedValue(mockResponse);

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
            (api.dialectic().createProject as Mock).mockResolvedValue(mockResponse);
            (api.dialectic().listProjects as Mock).mockResolvedValue({
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
            const createProjectCall = (api.dialectic().createProject as Mock).mock.calls[0][0];
            expect(createProjectCall).toBeInstanceOf(FormData);
            expect(createProjectCall.get('projectName')).toBe(mockPayload.projectName);
            expect(createProjectCall.get('initialUserPromptText')).toBe(mockPayload.initialUserPrompt);
            expect(createProjectCall.get('selectedDomainId')).toBe(mockPayload.selectedDomainId);
        });

        it('should handle API errors when creating a project', async () => {
            const mockError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to create' };
            const mockResponse: ApiResponse<DialecticProject> = {
                error: mockError,
                status: 500,
            };
            (api.dialectic().createProject as Mock).mockResolvedValue(mockResponse);

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
            (api.dialectic().createProject as Mock).mockResolvedValue(mockResponse);
            (api.dialectic().listProjects as Mock).mockResolvedValue({
                data: [mockProject],
                status: 200,
            });

            const createProject = useDialecticStore.getState().createDialecticProject;
            await createProject(payloadWithFile);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);

            const createProjectCall = (api.dialectic().createProject as Mock).mock.calls[0][0];
            expect(createProjectCall).toBeInstanceOf(FormData);
            expect(createProjectCall.get('promptFile')).toBe(mockFile);
        });
    });

    // New test suite for generateContributions
    describe('generateContributions action', () => {
        const mockPayload: GenerateContributionsPayload = {
            sessionId: 'session-123',
            projectId: 'project-abc',
            stageSlug: 'thesis',
            iterationNumber: 1,
        };
        const mockSuccessResponse: GenerateContributionsResponse = { message: 'Contributions generated' };
        const mockProjectDetails: DialecticProject = {
            id: 'project-abc',
            user_id: 'user-1',
            project_name: 'Test Project',
            selected_domain_id: 'domain-1',
            selected_domain_overlay_id: null,
            dialectic_domains: { name: 'Test Domain' },
            repo_url: null,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dialectic_sessions: [],
            resources: [], // Assuming resources is an array
            process_template_id: 'pt-1',
            dialectic_process_templates: { // Mock process template details
                id: 'pt-1',
                name: 'Test Process',
                description: 'Mock process template',
                created_at: new Date().toISOString(),
                stages: [], // Add stages array
                transitions: [], // Add transitions array
                starting_stage_id: null, // Add starting_stage_id
            },
            // Add missing fields from DialecticProject that are in initialDialecticStateValues.currentProjectDetail
            initial_user_prompt: 'Test initial prompt',
            isLoadingProcessTemplate: false,
            processTemplateError: null,
            contributionGenerationStatus: 'idle',
            generateContributionsError: null,
            isSubmittingStageResponses: false,
            submitStageResponsesError: null,
            isSavingContributionEdit: false,
            saveContributionEditError: null,
        };
        const mockApiError: ApiError = { message: 'API Error', code: 'API_FAIL' };
        const networkError = new Error('Network Error');

        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.runOnlyPendingTimers();
            vi.useRealTimers();
        });

        it('should handle successful contribution generation and project detail refresh', async () => {
            getMockDialecticClient().generateContributions.mockResolvedValue({ data: mockSuccessResponse, status: 200 });
            getMockDialecticClient().getProjectDetails.mockResolvedValue({ data: mockProjectDetails, status: 200 });
            // Add mock for fetchProcessTemplate if it's called
            getMockDialecticClient().fetchProcessTemplate.mockResolvedValue({ 
                data: mockProjectDetails.dialectic_process_templates as DialecticProcessTemplate, // Use the one from mockProjectDetails
                status: 200 
            });


            const { generateContributions } = useDialecticStore.getState();
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('idle');

            const promise = generateContributions(mockPayload);

            // Immediately after the call, status should be 'generating'
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');

            const result = await promise;

            expect(result.data).toEqual(mockSuccessResponse);
            expect(api.dialectic().generateContributions).toHaveBeenCalledWith(mockPayload);
            expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(mockPayload.projectId);
            
            const finalState = useDialecticStore.getState();
            expect(finalState.contributionGenerationStatus).toBe('idle');
            expect(finalState.generateContributionsError).toBeNull();
            expect(finalState.currentProjectDetail?.id).toBe(mockProjectDetails.id);
            // Ensure fetchProcessTemplate was called if project has template_id
            if (mockProjectDetails.process_template_id) {
                expect(getMockDialecticClient().fetchProcessTemplate).toHaveBeenCalledWith({ templateId: mockProjectDetails.process_template_id });
            }
        });

        it('should set contributionGenerationStatus to "generating" during the API call', async () => {
            let resolveApi: (value: ApiResponse<GenerateContributionsResponse>) => void;
            const apiPromise = new Promise<ApiResponse<GenerateContributionsResponse>>(resolve => {
                resolveApi = resolve;
            });
            getMockDialecticClient().generateContributions.mockImplementation(() => apiPromise);
            // Mock getProjectDetails as it's called in the success path
            getMockDialecticClient().getProjectDetails.mockResolvedValue({ data: mockProjectDetails, status: 200 });
            getMockDialecticClient().fetchProcessTemplate.mockResolvedValue({ 
                data: mockProjectDetails.dialectic_process_templates as DialecticProcessTemplate, 
                status: 200 
            });

            const { generateContributions } = useDialecticStore.getState();
            const generationFullPromise = generateContributions(mockPayload); // Don't await here

            // Immediately after the call, status should be 'generating'
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');

            // Resolve the API call
            resolveApi!({ data: mockSuccessResponse, status: 200 });
            await generationFullPromise; // Wait for the entire thunk to complete

            // After completion, it should be 'idle'
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('idle');
        });

        it('should handle API error during contribution generation', async () => {
            getMockDialecticClient().generateContributions.mockResolvedValue({ error: mockApiError, status: 500, data: undefined });

            const { generateContributions } = useDialecticStore.getState();
            const promise = generateContributions(mockPayload);
            
            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');

            const result = await promise;

            expect(result.error).toEqual(mockApiError);
            const finalState = useDialecticStore.getState();
            expect(finalState.contributionGenerationStatus).toBe('failed');
            expect(finalState.generateContributionsError).toEqual(mockApiError);
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
        });

        it('should handle network error during contribution generation', async () => {
            getMockDialecticClient().generateContributions.mockRejectedValue(networkError);

            const { generateContributions } = useDialecticStore.getState();
            const promise = generateContributions(mockPayload);

            expect(useDialecticStore.getState().contributionGenerationStatus).toBe('generating');
            
            const result = await promise;

            expect(result.error).toEqual({ message: networkError.message, code: 'NETWORK_ERROR' });
            const finalState = useDialecticStore.getState();
            expect(finalState.contributionGenerationStatus).toBe('failed');
            expect(finalState.generateContributionsError).toEqual({ message: networkError.message, code: 'NETWORK_ERROR' });
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
        });

        it('isLoadingProjectDetail should be true during fetchDialecticProjectDetails call after successful generation', async () => {
            getMockDialecticClient().generateContributions.mockResolvedValue({ data: mockSuccessResponse, status: 200 });
            
            let resolveGetDetails: (value: ApiResponse<DialecticProject>) => void;
            const getDetailsPromise = new Promise<ApiResponse<DialecticProject>>(resolve => {
                resolveGetDetails = resolve;
            });

            // Add projectId parameter to the mock implementation
            getMockDialecticClient().getProjectDetails.mockImplementation((projectId: string) => { 
                // Check isLoadingProjectDetail when getProjectDetails is called
                expect(useDialecticStore.getState().isLoadingProjectDetail).toBe(true);
                // You can optionally use/assert the projectId if needed for the test logic
                console.log(`Mocked getProjectDetails called with projectId: ${projectId}`);
                return getDetailsPromise;
            });

            getMockDialecticClient().fetchProcessTemplate.mockResolvedValue({ 
                data: mockProjectDetails.dialectic_process_templates as DialecticProcessTemplate, 
                status: 200 
            });

            const { generateContributions } = useDialecticStore.getState();
            const generationFullPromise = generateContributions(mockPayload);
            
            // Allow generateContributions to proceed to call getProjectDetails
            await vi.advanceTimersByTimeAsync(0); 

            // Resolve getProjectDetails with a valid DialecticProject object
            resolveGetDetails!({ data: mockProjectDetails, status: 200 });
            await generationFullPromise;

            expect(useDialecticStore.getState().isLoadingProjectDetail).toBe(false); // Should be false after completion
            expect(getMockDialecticClient().getProjectDetails).toHaveBeenCalledWith(mockPayload.projectId);
        });
    });
}); 