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
  AIModelCatalogEntry,
  DialecticSession,
  SelectedModels,
  StartSessionPayload,
  UpdateSessionModelsPayload,
  DialecticStage,
  AssembledPrompt,
  StartSessionSuccessResponse,
} from '@paynless/types';
import { api } from '@paynless/api';

// Mock for @paynless/utils to spy on the logger
vi.mock('@paynless/utils', async (importOriginal) => {
    const original = await importOriginal<typeof import('@paynless/utils')>();
    return {
        ...original,
        logger: {
            ...original.logger,
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        },
    };
});

// Import logger AFTER the mock is set up
import { logger } from '@paynless/utils';

// Add the mock call here
vi.mock('@paynless/api', async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>();
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
import { resetApiMock, getMockDialecticClient, type MockDialecticApiClient } from '@paynless/api/mocks';

describe('useDialecticStore', () => {
    let mockDialecticApi: Mock<any, any>;

    beforeEach(() => {
        resetApiMock(); // Resets all mocks defined in @paynless/api/mocks
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks(); // resetApiMock should handle this for the api calls
    });
    describe('startDialecticSession action', () => {
        const startSessionPayload: StartSessionPayload = { 
            projectId: 'proj-123', 
            selectedModels: [{ id: 'model-abc', displayName: 'Model ABC' }], 
            sessionDescription: 'Test Session' 
        };
        const mockAssembledPrompt: AssembledPrompt = {
            promptContent: "This is a seed prompt.",
            source_prompt_resource_id: "resource-id-123",
        };
        const mockSession: DialecticSession = { 
            id: 'sess-xyz', 
            project_id: startSessionPayload.projectId, 
            session_description: startSessionPayload.sessionDescription || null,
            user_input_reference_url: null,
            iteration_count: 1,
            selected_models: [],
            status: 'pending_thesis',
            associated_chat_id: 'chat-123',
            current_stage_id: 'some-stage-id',
            created_at: '2023-01-01T00:00:00.000Z',
            updated_at: '2023-01-01T00:00:00.000Z',
            dialectic_session_models: [],
        };

        it('should start a session and refetch project details if project_id is present in response', async () => {
            const mockSuccessResponse: StartSessionSuccessResponse = {
                ...mockSession,
                seedPrompt: mockAssembledPrompt,
            };
            const mockResponse: ApiResponse<StartSessionSuccessResponse> = { data: mockSuccessResponse, status: 201 };
            getMockDialecticClient().startSession.mockResolvedValue(mockResponse);
            const mockProject: DialecticProject = { 
                id: startSessionPayload.projectId,
                user_id: 'user-1',
                project_name: 'Test Project',
                selected_domain_id: 'domain-1',
                dialectic_domains: null,
                selected_domain_overlay_id: null,
                repo_url: null,
                status: 'active',
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
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
            getMockDialecticClient().getProjectDetails.mockResolvedValue({ data: mockProject, status: 200 });
            getMockDialecticClient().listProjects.mockResolvedValue({ data: [], status: 200 }); // Still mock for safety, but shouldn't be called

            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toBeNull();
            expect(result.data).toEqual(mockSuccessResponse);
            expect(api.dialectic().startSession).toHaveBeenCalledWith(startSessionPayload);
            expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(startSessionPayload.projectId);
            expect(api.dialectic().listProjects).not.toHaveBeenCalled();
        });

        it('should start a session and refetch project list if project_id is NOT present in response', async () => {
            const mockSessionWithoutProjectId = { ...mockSession, project_id: null as any, seedPrompt: mockAssembledPrompt };
            const mockResponse: ApiResponse<StartSessionSuccessResponse> = { data: mockSessionWithoutProjectId, status: 201 };
            getMockDialecticClient().startSession.mockResolvedValue(mockResponse);
            getMockDialecticClient().listProjects.mockResolvedValue({ data: [], status: 200 });
            // Mock getProjectDetails for safety, but it shouldn't be called
            const mockProject: DialecticProject = { 
                id: "anyID",
                user_id: 'user-1',
                project_name: 'Test Project',
                selected_domain_id: 'domain-1',
                dialectic_domains: null,
                selected_domain_overlay_id: null,
                repo_url: null,
                status: 'active',
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
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
            getMockDialecticClient().getProjectDetails.mockResolvedValue({ data: mockProject, status: 200 });


            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toBeNull();
            expect(result.data).toEqual(mockSessionWithoutProjectId);
            expect(api.dialectic().startSession).toHaveBeenCalledWith(startSessionPayload);
            expect(api.dialectic().listProjects).toHaveBeenCalled();
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
        });

        it('should set error state if startSession API returns an error', async () => {
            const mockError: ApiError = { code: 'SESSION_ERROR', message: 'Failed to start session' };
            const mockResponse: ApiResponse<DialecticSession> = { error: mockError, status: 500 };
            getMockDialecticClient().startSession.mockResolvedValue(mockResponse);

            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toEqual(mockError);
            expect(result.error).toEqual(mockError);
        });

        it('should set network error state if startSession API call throws', async () => {
            const networkErrorMessage = 'Session service network error';
            getMockDialecticClient().startSession.mockRejectedValue(new Error(networkErrorMessage));

            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
            expect(result.error).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });

        it('should set loading state during startDialecticSession', () => {
            getMockDialecticClient().startSession.mockReturnValue(new Promise(() => {}));
            const { startDialecticSession } = useDialecticStore.getState();
            startDialecticSession(startSessionPayload);
            expect(useDialecticStore.getState().isStartingSession).toBe(true);
            expect(useDialecticStore.getState().startSessionError).toBeNull();
        });
    });

    describe('fetchAIModelCatalog action', () => {
        it('should fetch and set AI model catalog on success', async () => {
            const mockCatalog: AIModelCatalogEntry[] = [
                { 
                    id: 'model1', 
                    provider_name: 'OpenAI', 
                    model_name: 'GPT-4', 
                    api_identifier: 'gpt-4',
                    created_at: '2023-01-01T00:00:00.000Z',
                    updated_at: '2023-01-01T00:00:00.000Z',
                    is_active: true,
                    description: null,
                    strengths: null,
                    weaknesses: null,
                    context_window_tokens: null,
                    input_token_cost_usd_millionths: null,
                    output_token_cost_usd_millionths: null,
                    max_output_tokens: null,
                },
                { 
                    id: 'model2', 
                    provider_name: 'Anthropic', 
                    model_name: 'Claude 3', 
                    api_identifier: 'claude-3',
                    created_at: '2023-01-01T00:00:00.000Z',
                    updated_at: '2023-01-01T00:00:00.000Z',
                    is_active: true,
                    description: null,
                    strengths: null,
                    weaknesses: null,
                    context_window_tokens: null,
                    input_token_cost_usd_millionths: null,
                    output_token_cost_usd_millionths: null,
                    max_output_tokens: null,
                },
            ];
            const mockResponse: ApiResponse<AIModelCatalogEntry[]> = { data: mockCatalog, status: 200 };
            getMockDialecticClient().listModelCatalog.mockResolvedValue(mockResponse);

            const { fetchAIModelCatalog } = useDialecticStore.getState();
            await fetchAIModelCatalog();

            const state = useDialecticStore.getState();
            expect(state.isLoadingModelCatalog).toBe(false);
            expect(state.modelCatalog).toEqual(mockCatalog);
            expect(state.modelCatalogError).toBeNull();
            expect(api.dialectic().listModelCatalog).toHaveBeenCalledTimes(1);
        });

        it('should set error state if listModelCatalog API returns an error', async () => {
            const mockError: ApiError = { code: 'CATALOG_ERROR', message: 'Failed to fetch model catalog' };
            const mockResponse: ApiResponse<AIModelCatalogEntry[]> = { error: mockError, status: 500 };
            getMockDialecticClient().listModelCatalog.mockResolvedValue(mockResponse);

            const { fetchAIModelCatalog } = useDialecticStore.getState();
            await fetchAIModelCatalog();

            const state = useDialecticStore.getState();
            expect(state.isLoadingModelCatalog).toBe(false);
            expect(state.modelCatalog).toEqual([]);
            expect(state.modelCatalogError).toEqual(mockError);
        });

        it('should set network error state if listModelCatalog API call throws', async () => {
            const networkErrorMessage = 'Catalog service unavailable';
            getMockDialecticClient().listModelCatalog.mockRejectedValue(new Error(networkErrorMessage));

            const { fetchAIModelCatalog } = useDialecticStore.getState();
            await fetchAIModelCatalog();

            const state = useDialecticStore.getState();
            expect(state.isLoadingModelCatalog).toBe(false);
            expect(state.modelCatalog).toEqual([]);
            expect(state.modelCatalogError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });

        it('should set loading state during fetchAIModelCatalog', () => {
            getMockDialecticClient().listModelCatalog.mockReturnValue(new Promise(() => {}));
            const { fetchAIModelCatalog } = useDialecticStore.getState();
            fetchAIModelCatalog(); // Do not await
            expect(useDialecticStore.getState().isLoadingModelCatalog).toBe(true);
            expect(useDialecticStore.getState().modelCatalogError).toBeNull();
        });
    });

    describe('updateSessionModels action', () => {
        const sessionId = 'sess-update-models-123';
        const projectId = 'proj-for-session-update';
        const initialSelectedModels: SelectedModels[] = [{ id: 'model-a', displayName: 'Model A' }];
        const updatedSelectedModels: SelectedModels[] = [{ id: 'model-b', displayName: 'Model B' }, { id: 'model-c', displayName: 'Model C' }];

        const mockInitialSession: DialecticSession = {
            id: sessionId,
            project_id: projectId,
            selected_models: initialSelectedModels,
            session_description: 'Initial session for model update test',
            user_input_reference_url: null,
            iteration_count: 1,
            status: 'active',
            associated_chat_id: null,
            current_stage_id: 'stage-x',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const mockUpdatedSessionFromApi: DialecticSession = {
            ...mockInitialSession,
            selected_models: updatedSelectedModels,
            updated_at: new Date(Date.now() + 1000).toISOString(), // Ensure updated_at is different
        };

        const mockProjectDetailWithSession: DialecticProject = {
            id: projectId,
            project_name: 'Project For Session Model Update',
            user_id: 'user-test',
            initial_user_prompt: 'Test prompt',
            selected_domain_id: 'dom-test',
            dialectic_domains: { name: 'Test Domain' },
            selected_domain_overlay_id: null,
            repo_url: null,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dialectic_sessions: [mockInitialSession],
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

        const payload: UpdateSessionModelsPayload = {
            sessionId: sessionId,
            selectedModels: updatedSelectedModels,
        };

        beforeEach(() => {
            // Set initial state with a project detail that includes the session to be updated
            useDialecticStore.setState({ currentProjectDetail: mockProjectDetailWithSession });
        });

        it('should update session models and project detail on successful API call', async () => {
            const mockApiResponse: ApiResponse<DialecticSession> = {
                data: mockUpdatedSessionFromApi,
                status: 200,
            };
            getMockDialecticClient().updateSessionModels.mockResolvedValue(mockApiResponse);

            const { updateSessionModels } = useDialecticStore.getState();
            const result = await updateSessionModels(payload);

            const state = useDialecticStore.getState();
            expect(state.isUpdatingSessionModels).toBe(false);
            expect(state.updateSessionModelsError).toBeNull();
            expect(result.data).toEqual(mockUpdatedSessionFromApi);
            expect(getMockDialecticClient().updateSessionModels).toHaveBeenCalledWith(payload);

            // Verify that the session within currentProjectDetail is updated
            const updatedProjectDetail = state.currentProjectDetail;
            expect(updatedProjectDetail).not.toBeNull();
            const sessionInProject = updatedProjectDetail?.dialectic_sessions?.find(s => s.id === sessionId);
            expect(sessionInProject).toBeDefined();
            expect(sessionInProject?.selected_models).toEqual(updatedSelectedModels);
            expect(sessionInProject?.updated_at).toEqual(mockUpdatedSessionFromApi.updated_at);
        });

        it('should set error state if API returns an error', async () => {
            const mockError: ApiError = { code: 'UPDATE_FAILED', message: 'Failed to update session models' };
            const mockApiResponse: ApiResponse<DialecticSession> = {
                error: mockError,
                status: 500,
            };
            getMockDialecticClient().updateSessionModels.mockResolvedValue(mockApiResponse);

            const { updateSessionModels } = useDialecticStore.getState();
            const result = await updateSessionModels(payload);

            const state = useDialecticStore.getState();
            expect(state.isUpdatingSessionModels).toBe(false);
            expect(state.updateSessionModelsError).toEqual(mockError);
            expect(result.error).toEqual(mockError);

            // Ensure project detail was not inadvertently changed on error
            const projectDetail = state.currentProjectDetail;
            const sessionInProject = projectDetail?.dialectic_sessions?.find(s => s.id === sessionId);
            expect(sessionInProject?.selected_models).toEqual(initialSelectedModels);
        });

        it('should set network error state if API call throws', async () => {
            const networkErrorMessage = 'Network connection failed during model update';
            getMockDialecticClient().updateSessionModels.mockRejectedValue(new Error(networkErrorMessage));

            const { updateSessionModels } = useDialecticStore.getState();
            const result = await updateSessionModels(payload);

            const state = useDialecticStore.getState();
            expect(state.isUpdatingSessionModels).toBe(false);
            expect(state.updateSessionModelsError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
            expect(result.error).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });

        it('should set loading state during the update process', () => {
            getMockDialecticClient().updateSessionModels.mockReturnValue(new Promise(() => {})); // Non-resolving promise
            const { updateSessionModels } = useDialecticStore.getState();
            updateSessionModels(payload); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isUpdatingSessionModels).toBe(true);
            expect(state.updateSessionModelsError).toBeNull();
        });
    });

    describe('setSelectedStageAssociation action', () => {
        it('should update selectedStageAssociation and clear overlay data', () => {
            const { setSelectedStageAssociation, fetchAvailableDomainOverlays } = useDialecticStore.getState();
            
            // Initial fetch to populate some overlay data to ensure it's cleared
            useDialecticStore.setState({
                availableDomainOverlays: [{ id: '1', domainId: 'domain-1', domainName: 'Test Domain', description: 'test', stageAssociation: 'thesis', overlay_values: {} }],
                domainOverlaysError: { code: 'ERROR', message: 'some error' },
                isLoadingDomainOverlays: true,
            });

            const mockStage: DialecticStage = { id: 'stage-1', slug: 'thesis', display_name: 'Thesis', description: 'Test stage', default_system_prompt_id: 'p1', expected_output_template_ids: [], recipe_template_id: null, active_recipe_instance_id: null, created_at: 'now' };
            setSelectedStageAssociation(mockStage);
            let state = useDialecticStore.getState();
            expect(state.selectedStageAssociation).toEqual(mockStage);
            expect(state.availableDomainOverlays).toEqual([]);
            expect(state.domainOverlaysError).toBeNull();
            expect(state.isLoadingDomainOverlays).toBe(false);

            setSelectedStageAssociation(null);
            state = useDialecticStore.getState();
            expect(state.selectedStageAssociation).toBeNull();
            expect(state.availableDomainOverlays).toEqual([]);
            expect(state.domainOverlaysError).toBeNull();
            expect(state.isLoadingDomainOverlays).toBe(false);
        });
    });

    describe('setSelectedModels action', () => {
        const activeSessionId = 'sess-active-for-set';
        const initialModels = ['model-x'];
        const newModels = ['model-y', 'model-z'];
        const initialModelsSelected: SelectedModels[] = [{ id: 'model-x', displayName: 'Model X' }];
        const newModelsSelected: SelectedModels[] = [
            { id: 'model-y', displayName: 'Model Y' },
            { id: 'model-z', displayName: 'Model Z' },
        ];

        beforeEach(() => {
            useDialecticStore.setState({ activeContextSessionId: activeSessionId });
            getMockDialecticClient().updateSessionModels.mockResolvedValue({ data: {
                id: activeSessionId,
                selected_models: initialModelsSelected,
                project_id: 'project-id',
                session_description: 'session description',
                user_input_reference_url: null,
                iteration_count: 1,
                associated_chat_id: null,
                current_stage_id: 'stage-x',
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
                status: 'active',
            }, status: 200 });
        });

        it('should update selectedModels from updateSessionModels response when API succeeds', async () => {
            getMockDialecticClient().updateSessionModels.mockResolvedValue({
                data: {
                    id: activeSessionId,
                    selected_models: newModelsSelected,
                    project_id: 'project-id',
                    session_description: 'session description',
                    user_input_reference_url: null,
                    iteration_count: 1,
                    associated_chat_id: null,
                    current_stage_id: 'stage-x',
                    created_at: '2023-01-01T00:00:00.000Z',
                    updated_at: '2023-01-01T00:00:00.000Z',
                    status: 'active',
                },
                status: 200,
            });
            useDialecticStore.setState({ selectedModels: initialModelsSelected });
            const { setSelectedModels } = useDialecticStore.getState();
            setSelectedModels(newModelsSelected);
            await vi.waitFor(() => {
                expect(useDialecticStore.getState().selectedModels).toEqual(newModelsSelected);
            });
        });

        it('should call updateSessionModels in the background if activeContextSessionId is set', async () => {
            const { setSelectedModels } = useDialecticStore.getState();
            setSelectedModels(newModelsSelected);

            // Since the API call is in a .then() block, we might need to wait for microtasks
            await vi.waitFor(() => {
                expect(getMockDialecticClient().updateSessionModels).toHaveBeenCalledWith({
                    sessionId: activeSessionId,
                    selectedModels: newModelsSelected,
                });
            });
        });

        it('should not call updateSessionModels if activeContextSessionId is null', async () => {
            useDialecticStore.setState({ activeContextSessionId: null });
            const { setSelectedModels } = useDialecticStore.getState();
            setSelectedModels(newModelsSelected);

            // Wait a brief moment to ensure no async call is made
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(getMockDialecticClient().updateSessionModels).not.toHaveBeenCalled();
        });

        it('should log an error if background updateSessionModels fails', async () => {
            const mockApiError: ApiError = { code: 'BG_UPDATE_FAIL', message: 'Background update failed' };
            getMockDialecticClient().updateSessionModels.mockResolvedValue({ error: mockApiError, status: 500 });
            vi.mocked(logger).error.mockClear();

            const { setSelectedModels } = useDialecticStore.getState();
            setSelectedModels(newModelsSelected);

            await vi.waitFor(() => {
                expect(getMockDialecticClient().updateSessionModels).toHaveBeenCalled();
                expect(vi.mocked(logger).error).toHaveBeenCalledWith(
                    '[DialecticStore] Post-setSelectedModels: Failed to update session models on backend',
                    {
                        sessionId: activeSessionId,
                        error: mockApiError,
                    }
                );
            });
        });
    });

    describe('setModelMultiplicity action', () => {
        const activeSessionId = 'sess-active-for-multiplicity';
        const modelToChangeObj: SelectedModels = { id: 'model-alpha', displayName: 'Model Alpha' };
        const initialOtherModelObj: SelectedModels = { id: 'model-beta', displayName: 'Model Beta' };
        const modelGammaObj: SelectedModels = { id: 'model-gamma', displayName: 'Model Gamma' };
        const selectedModelsThree: SelectedModels[] = [
            modelToChangeObj,
            initialOtherModelObj,
            modelToChangeObj,
        ];

        beforeEach(() => {
            useDialecticStore.setState({
                activeContextSessionId: activeSessionId,
                selectedModels: selectedModelsThree,
            });
            getMockDialecticClient().updateSessionModels.mockResolvedValue({ data: {
                id: activeSessionId,
                selected_models: selectedModelsThree,
                project_id: 'project-id',
                session_description: 'session description',
                user_input_reference_url: null,
                iteration_count: 1,
                associated_chat_id: null,
                current_stage_id: 'stage-x',
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
                status: 'active',
            }, status: 200 });
            vi.mocked(logger).error.mockClear();
        });

        it('should call updateSessionModels with correct ids for each multiplicity change', () => {
            useDialecticStore.setState({
                selectedModels: selectedModelsThree,
            });
            const { setModelMultiplicity } = useDialecticStore.getState();

            setModelMultiplicity(modelToChangeObj, 1);
            expect(getMockDialecticClient().updateSessionModels).toHaveBeenNthCalledWith(1, {
                sessionId: activeSessionId,
                selectedModels: [initialOtherModelObj, modelToChangeObj],
            });

            setModelMultiplicity(modelToChangeObj, 3);
            expect(getMockDialecticClient().updateSessionModels).toHaveBeenNthCalledWith(2, {
                sessionId: activeSessionId,
                selectedModels: [initialOtherModelObj, modelToChangeObj, modelToChangeObj, modelToChangeObj],
            });

            setModelMultiplicity(modelGammaObj, 2);
            expect(getMockDialecticClient().updateSessionModels).toHaveBeenNthCalledWith(3, {
                sessionId: activeSessionId,
                selectedModels: [initialOtherModelObj, modelToChangeObj, modelToChangeObj, modelToChangeObj, modelGammaObj, modelGammaObj],
            });
        });

        it('should call updateSessionModels in the background with the new list of IDs', async () => {
            const oneModelSelected: SelectedModels[] = [initialOtherModelObj];
            useDialecticStore.setState({
                selectedModels: oneModelSelected,
            });
            const { setModelMultiplicity } = useDialecticStore.getState();
            const count = 2;
            setModelMultiplicity(modelToChangeObj, count);
            const expectedModels: SelectedModels[] = [initialOtherModelObj, modelToChangeObj, modelToChangeObj];

            await vi.waitFor(() => {
                expect(getMockDialecticClient().updateSessionModels).toHaveBeenCalledWith({
                    sessionId: activeSessionId,
                    selectedModels: expectedModels,
                });
                const actualArgs = getMockDialecticClient().updateSessionModels.mock.calls[0][0];
                expect(actualArgs.selectedModels.map((m) => m.id).sort()).toEqual(expectedModels.map((m) => m.id).sort());
            });
        });

        it('should log an error if background updateSessionModels fails for setModelMultiplicity', async () => {
            const mockApiError: ApiError = { code: 'MULTIPLICITY_FAIL', message: 'Multiplicity background update failed' };
            getMockDialecticClient().updateSessionModels.mockResolvedValue({ error: mockApiError, status: 500 });
            const count = 2;

            const { setModelMultiplicity } = useDialecticStore.getState();
            setModelMultiplicity(modelToChangeObj, count);

            await vi.waitFor(() => {
                expect(getMockDialecticClient().updateSessionModels).toHaveBeenCalled();
                expect(vi.mocked(logger).error).toHaveBeenNthCalledWith(
                    2,
                    '[DialecticStore] Post-setModelMultiplicity: Failed to update session models on backend',
                    {
                        sessionId: activeSessionId,
                        modelId: modelToChangeObj.id,
                        count: count,
                        error: mockApiError,
                    }
                );
            });
        });

        it('should handle setting multiplicity to 0 (removing the model)', async () => {
            const afterRemoveSelected: SelectedModels[] = [initialOtherModelObj];
            getMockDialecticClient().updateSessionModels.mockResolvedValue({
                data: {
                    id: activeSessionId,
                    selected_models: afterRemoveSelected,
                    project_id: 'project-id',
                    session_description: 'session description',
                    user_input_reference_url: null,
                    iteration_count: 1,
                    associated_chat_id: null,
                    current_stage_id: 'stage-x',
                    created_at: '2023-01-01T00:00:00.000Z',
                    updated_at: '2023-01-01T00:00:00.000Z',
                    status: 'active',
                },
                status: 200,
            });
            const twoModelsSelected: SelectedModels[] = [modelToChangeObj, initialOtherModelObj];
            useDialecticStore.setState({
                selectedModels: twoModelsSelected,
            });
            const { setModelMultiplicity } = useDialecticStore.getState();
            setModelMultiplicity(modelToChangeObj, 0);
            await vi.waitFor(() => {
                const selected = useDialecticStore.getState().selectedModels;
                expect(selected).toBeDefined();
                expect(selected!.map((m) => m.id)).toEqual([initialOtherModelObj.id]);
            });
        });
    });

    describe('setSelectedStageAssociation action', () => {
        it('should update selectedStageAssociation and clear overlay data', () => {
            const { setSelectedStageAssociation, fetchAvailableDomainOverlays } = useDialecticStore.getState();
            
            // Initial fetch to populate some overlay data to ensure it's cleared
            useDialecticStore.setState({
                availableDomainOverlays: [{ id: '1', domainId: 'domain-1', domainName: 'Test Domain', description: 'test', stageAssociation: 'thesis', overlay_values: {} }],
                domainOverlaysError: { code: 'ERROR', message: 'some error' },
                isLoadingDomainOverlays: true,
            });

            const mockStage: DialecticStage = { id: 'stage-1', slug: 'thesis', display_name: 'Thesis', description: 'Test stage', default_system_prompt_id: 'p1', expected_output_template_ids: [], recipe_template_id: null, active_recipe_instance_id: null, created_at: 'now' };
            setSelectedStageAssociation(mockStage);
            let state = useDialecticStore.getState();
            expect(state.selectedStageAssociation).toEqual(mockStage);
            expect(state.availableDomainOverlays).toEqual([]);
            expect(state.domainOverlaysError).toBeNull();
            expect(state.isLoadingDomainOverlays).toBe(false);

            setSelectedStageAssociation(null);
            state = useDialecticStore.getState();
            expect(state.selectedStageAssociation).toBeNull();
            expect(state.availableDomainOverlays).toEqual([]);
            expect(state.domainOverlaysError).toBeNull();
            expect(state.isLoadingDomainOverlays).toBe(false);
        });
    });

    describe('fetchAndSetCurrentSessionDetails Thunk', () => {
        const mockProjectId = 'proj-for-sess-123';
        const mockSessionId = 'sess-fetch-123';

        const mockSessionData: DialecticSession = {
            id: mockSessionId,
            project_id: mockProjectId,
            session_description: 'Fetched session',
            iteration_count: 2,
            current_stage_id: 'synthesis-id',
            status: 'active',
            user_input_reference_url: null,
            associated_chat_id: null,
            created_at: '2023-01-01T00:00:00.000Z',
            updated_at: '2023-01-01T00:00:00.000Z',
            dialectic_session_models: [],
            dialectic_contributions: [],
            feedback: [],
            selected_models: [],
        };

        const mockStageDetails: DialecticStage = {
            id: 'synthesis-id',
            slug: 'synthesis',
            display_name: 'Synthesis',
            description: 'Test stage',
            default_system_prompt_id: 'p1',
            expected_output_template_ids: [],
            recipe_template_id: null,
            active_recipe_instance_id: null,
            created_at: 'now',
        };

        const mockSeedPrompt: AssembledPrompt = {
            promptContent: 'Mock seed prompt from session details',
            source_prompt_resource_id: 'res-seed-1',
        };

        const mockApiResponse: ApiResponse<{ 
            session: DialecticSession; 
            currentStageDetails: DialecticStage; 
            activeSeedPrompt: AssembledPrompt | null; 
        }> = {
            data: {
                session: mockSessionData,
                currentStageDetails: mockStageDetails,
                activeSeedPrompt: mockSeedPrompt,
            },
            status: 200,
        };

        it('should fetch session details, update state, and set context on success', async () => {
            getMockDialecticClient().getSessionDetails.mockResolvedValue(mockApiResponse);
            useDialecticStore.setState({ ...initialDialecticStateValues });

            await useDialecticStore.getState().fetchAndSetCurrentSessionDetails(mockSessionId);

            const state = useDialecticStore.getState();
            expect(state.isLoadingActiveSessionDetail).toBe(false);
            expect(state.activeSessionDetail).toEqual(mockSessionData);
            expect(state.activeSessionDetailError).toBeNull();
            expect(state.activeContextProjectId).toEqual(mockProjectId);
            expect(state.activeContextSessionId).toEqual(mockSessionId);
            expect(state.activeContextStage).toEqual(mockStageDetails);
            expect(state.activeSeedPrompt).toEqual(mockSeedPrompt);
            expect(state.selectedModels).toEqual(mockSessionData.selected_models);
        });

        it('should persist selectedModels from session response (single origin)', async () => {
            const selectedModelsFromResponse: SelectedModels[] = [
                { id: 'model-1', displayName: 'Model One' },
                { id: 'model-2', displayName: 'Model Two' },
            ];
            const sessionWithSelectedModels: DialecticSession = {
                ...mockSessionData,
                selected_models: selectedModelsFromResponse,
            };
            const apiResponseWithSelectedModels: ApiResponse<{
                session: DialecticSession;
                currentStageDetails: DialecticStage | null;
                activeSeedPrompt: AssembledPrompt | null;
            }> = {
                data: {
                    session: sessionWithSelectedModels,
                    currentStageDetails: mockStageDetails,
                    activeSeedPrompt: mockSeedPrompt,
                },
                status: 200,
            };
            getMockDialecticClient().getSessionDetails.mockResolvedValue(apiResponseWithSelectedModels);
            useDialecticStore.setState({ ...initialDialecticStateValues });

            await useDialecticStore.getState().fetchAndSetCurrentSessionDetails(mockSessionId);

            const state = useDialecticStore.getState();
            expect(state.selectedModels).toEqual(selectedModelsFromResponse);
        });
        
        it('should update an existing session in currentProjectDetail.dialectic_sessions', async () => {
            const olderVersionOfSession = { ...mockSessionData, session_description: 'Older version' };
            const initialProjectState: DialecticProject = {
                id: mockProjectId,
                dialectic_sessions: [olderVersionOfSession],
                user_id: 'user-1',
                project_name: 'Test Project',
                selected_domain_id: 'domain-1',
                dialectic_domains: null,
                selected_domain_overlay_id: null,
                repo_url: null,
                status: 'active',
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
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
            useDialecticStore.setState({ currentProjectDetail: initialProjectState });
            getMockDialecticClient().getSessionDetails.mockResolvedValue(mockApiResponse);

            await useDialecticStore.getState().fetchAndSetCurrentSessionDetails(mockSessionId);

            const state = useDialecticStore.getState();
            const sessionInProject = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === mockSessionId);
            
            expect(sessionInProject).toEqual(expect.objectContaining(mockSessionData));
            expect(state.currentProjectDetail?.dialectic_sessions?.length).toBe(1);
        });

        it('should add the session to currentProjectDetail.dialectic_sessions if it does not exist', async () => {
            const initialProjectState: DialecticProject = {
                id: mockProjectId,
                dialectic_sessions: [], // Session does not exist
                user_id: 'user-1',
                project_name: 'Test Project',
                selected_domain_id: 'domain-1',
                dialectic_domains: null,
                selected_domain_overlay_id: null,
                repo_url: null,
                status: 'active',
                created_at: '2023-01-01T00:00:00.000Z',
                updated_at: '2023-01-01T00:00:00.000Z',
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

            useDialecticStore.setState({ currentProjectDetail: initialProjectState });
            getMockDialecticClient().getSessionDetails.mockResolvedValue(mockApiResponse);

            await useDialecticStore.getState().fetchAndSetCurrentSessionDetails(mockSessionId);

            const state = useDialecticStore.getState();
            expect(state.currentProjectDetail?.dialectic_sessions?.length).toBe(1);
            expect(state.currentProjectDetail?.dialectic_sessions?.[0]).toEqual(
                expect.objectContaining(mockSessionData)
            );
        });

        it('should not modify currentProjectDetail if it is null', async () => {
            useDialecticStore.setState({ currentProjectDetail: null });
            getMockDialecticClient().getSessionDetails.mockResolvedValue(mockApiResponse);

            await useDialecticStore.getState().fetchAndSetCurrentSessionDetails(mockSessionId);
            
            const state = useDialecticStore.getState();
            expect(state.activeSessionDetail).toEqual(mockSessionData);
            expect(state.currentProjectDetail).toBeNull(); // Should not create a project detail object
        });

        it('should preserve existing activeSeedPrompt and not overwrite it when getSessionDetails is called', async () => {
            const existingSeedPrompt: AssembledPrompt = {
                promptContent: 'Existing seed prompt from startSession',
                source_prompt_resource_id: 'res-existing-seed-1',
            };
            
            useDialecticStore.setState({ 
                activeSeedPrompt: existingSeedPrompt,
                activeContextSessionId: mockSessionId,
            });

            const differentSeedPrompt: AssembledPrompt = {
                promptContent: 'Different seed prompt from getSessionDetails',
                source_prompt_resource_id: 'res-different-seed-2',
            };

            const apiResponseWithDifferentSeedPrompt: ApiResponse<{ 
                session: DialecticSession; 
                currentStageDetails: DialecticStage; 
                activeSeedPrompt: AssembledPrompt | null; 
            }> = {
                data: {
                    session: mockSessionData,
                    currentStageDetails: mockStageDetails,
                    activeSeedPrompt: differentSeedPrompt,
                },
                status: 200,
            };

            getMockDialecticClient().getSessionDetails.mockResolvedValue(apiResponseWithDifferentSeedPrompt);

            await useDialecticStore.getState().fetchAndSetCurrentSessionDetails(mockSessionId);

            const state = useDialecticStore.getState();
            expect(state.isLoadingActiveSessionDetail).toBe(false);
            expect(state.activeSessionDetail).toEqual(mockSessionData);
            expect(state.activeSessionDetailError).toBeNull();
            expect(state.activeSeedPrompt).toEqual(existingSeedPrompt);
            expect(state.activeSeedPrompt).not.toEqual(differentSeedPrompt);
        });
    });

    describe('activateProjectAndSessionContextForDeepLink Thunk', () => {
        const mockProjectId = 'deep-proj-123';
        const mockSessionId = 'deep-sess-456';

        let fetchDialecticProjectDetailsSpy;
        let fetchAndSetCurrentSessionDetailsSpy;

        beforeEach(() => {
            fetchDialecticProjectDetailsSpy = vi.spyOn(useDialecticStore.getState(), 'fetchDialecticProjectDetails').mockImplementationOnce(() => Promise.resolve());
            fetchAndSetCurrentSessionDetailsSpy = vi.spyOn(useDialecticStore.getState(), 'fetchAndSetCurrentSessionDetails').mockImplementationOnce(() => Promise.resolve());
        });

        afterEach(() => {
            fetchDialecticProjectDetailsSpy.mockRestore();
            fetchAndSetCurrentSessionDetailsSpy.mockRestore();
        });

        it('should call fetchDialecticProjectDetails then fetchAndSetCurrentSessionDetails if project context differs', async () => {
            useDialecticStore.setState({ activeContextProjectId: 'different-project-id' });

            const { activateProjectAndSessionContextForDeepLink } = useDialecticStore.getState();
            await activateProjectAndSessionContextForDeepLink(mockProjectId, mockSessionId);

            expect(fetchDialecticProjectDetailsSpy).toHaveBeenCalledWith(mockProjectId);
            expect(fetchAndSetCurrentSessionDetailsSpy).toHaveBeenCalledWith(mockSessionId);
        });

        it('should only call fetchAndSetCurrentSessionDetails if project context matches', async () => {
            useDialecticStore.setState({ 
                activeContextProjectId: mockProjectId,
                currentProjectDetail: {
                    id: mockProjectId, 
                    user_id: 'user-1',
                    project_name: 'Deep Link Test Project',
                    selected_domain_id: 'domain-1',
                    dialectic_domains: null,
                    selected_domain_overlay_id: null,
                    repo_url: null,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    dialectic_sessions: [],
                    resources: [],
                    process_template_id: null,
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

            const { activateProjectAndSessionContextForDeepLink } = useDialecticStore.getState();
            await activateProjectAndSessionContextForDeepLink(mockProjectId, mockSessionId);

            expect(fetchDialecticProjectDetailsSpy).not.toHaveBeenCalled();
            expect(fetchAndSetCurrentSessionDetailsSpy).toHaveBeenCalledWith(mockSessionId);
        });

        it('should call fetchDialecticProjectDetails then fetchAndSetCurrentSessionDetails if currentProjectDetail is null', async () => {
            useDialecticStore.setState({ activeContextProjectId: null, currentProjectDetail: null });

            const { activateProjectAndSessionContextForDeepLink } = useDialecticStore.getState();
            await activateProjectAndSessionContextForDeepLink(mockProjectId, mockSessionId);

            expect(fetchDialecticProjectDetailsSpy).toHaveBeenCalledWith(mockProjectId);
            expect(fetchAndSetCurrentSessionDetailsSpy).toHaveBeenCalledWith(mockSessionId);
        });

        it('should call fetchDialecticProjectDetails then fetchAndSetCurrentSessionDetails if activeContextProjectId is null', async () => {
            useDialecticStore.setState({ activeContextProjectId: null });

            const { activateProjectAndSessionContextForDeepLink } = useDialecticStore.getState();
            await activateProjectAndSessionContextForDeepLink(mockProjectId, mockSessionId);

            expect(fetchDialecticProjectDetailsSpy).toHaveBeenCalledWith(mockProjectId);
            expect(fetchAndSetCurrentSessionDetailsSpy).toHaveBeenCalledWith(mockSessionId);
        });
    });

    describe('Feedback File Content Actions', () => {
        it.todo('should have tests for feedback file content actions');
    });
});