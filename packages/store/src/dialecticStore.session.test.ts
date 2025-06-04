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
  DomainTagDescriptor,
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
import { resetApiMock, getMockDialecticClient, type MockDialecticApiClient } from '@paynless/api/mocks';

describe('useDialecticStore', () => {
    let mockDialecticApi: MockDialecticApiClient;

    beforeEach(() => {
        resetApiMock(); // Resets all mocks defined in @paynless/api/mocks
        mockDialecticApi = getMockDialecticClient(); // Get a reference to the dialectic specific mocks
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks(); // resetApiMock should handle this for the api calls
    });
    describe('startDialecticSession action', () => {
        const startSessionPayload: StartSessionPayload = { 
            projectId: 'proj-123', 
            selectedModelCatalogIds: ['model-abc'], 
            sessionDescription: 'Test Session' 
        };
        const mockSession: DialecticSession = { 
            id: 'sess-xyz', 
            project_id: startSessionPayload.projectId, 
            session_description: startSessionPayload.sessionDescription || null,
            current_stage_seed_prompt: '',
            iteration_count: 1,
            current_iteration: 1,
            status: 'pending_thesis',
            convergence_status: null,
            preferred_model_for_stage: null,
            associated_chat_id: 'chat-123',
            active_thesis_prompt_template_id: null,
            active_antithesis_prompt_template_id: null,
            active_synthesis_prompt_template_id: null,
            active_parenthesis_prompt_template_id: null,
            active_paralysis_prompt_template_id: null,
            formal_debate_structure_id: null,
            max_iterations: 3,
            created_at: '2023-01-01T00:00:00.000Z',
            updated_at: '2023-01-01T00:00:00.000Z',
            dialectic_session_models: [],
            dialectic_contributions: [],
        };

        it('should start a session and refetch project details if project_id is present in response', async () => {
            const mockResponse: ApiResponse<DialecticSession> = { data: mockSession, status: 201 };
            mockDialecticApi.startSession.mockResolvedValue(mockResponse);
            const mockProject: DialecticProject = { id: startSessionPayload.projectId } as DialecticProject;
            mockDialecticApi.getProjectDetails.mockResolvedValue({ data: mockProject, status: 200 });
            mockDialecticApi.listProjects.mockResolvedValue({ data: [], status: 200 }); // Still mock for safety, but shouldn't be called

            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toBeNull();
            expect(result.data).toEqual(mockSession);
            expect(mockDialecticApi.startSession).toHaveBeenCalledWith(startSessionPayload);
            expect(mockDialecticApi.getProjectDetails).toHaveBeenCalledWith(startSessionPayload.projectId);
            expect(mockDialecticApi.listProjects).not.toHaveBeenCalled();
        });

        it('should start a session and refetch project list if project_id is NOT present in response', async () => {
            const mockSessionWithoutProjectId: DialecticSession = { ...mockSession, project_id: null as any }; // or undefined
            const mockResponse: ApiResponse<DialecticSession> = { data: mockSessionWithoutProjectId, status: 201 };
            mockDialecticApi.startSession.mockResolvedValue(mockResponse);
            mockDialecticApi.listProjects.mockResolvedValue({ data: [], status: 200 });
            // Mock getProjectDetails for safety, but it shouldn't be called
            const mockProject: DialecticProject = { id: "anyID" } as DialecticProject;
            mockDialecticApi.getProjectDetails.mockResolvedValue({ data: mockProject, status: 200 });


            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toBeNull();
            expect(result.data).toEqual(mockSessionWithoutProjectId);
            expect(mockDialecticApi.startSession).toHaveBeenCalledWith(startSessionPayload);
            expect(mockDialecticApi.listProjects).toHaveBeenCalled();
            expect(mockDialecticApi.getProjectDetails).not.toHaveBeenCalled();
        });

        it('should set error state if startSession API returns an error', async () => {
            const mockError: ApiError = { code: 'SESSION_ERROR', message: 'Failed to start session' };
            const mockResponse: ApiResponse<DialecticSession> = { error: mockError, status: 500 };
            mockDialecticApi.startSession.mockResolvedValue(mockResponse);

            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toEqual(mockError);
            expect(result.error).toEqual(mockError);
        });

        it('should set network error state if startSession API call throws', async () => {
            const networkErrorMessage = 'Session service network error';
            mockDialecticApi.startSession.mockRejectedValue(new Error(networkErrorMessage));

            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
            expect(result.error).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });

        it('should set loading state during startDialecticSession', () => {
            mockDialecticApi.startSession.mockReturnValue(new Promise(() => {}));
            const { startDialecticSession } = useDialecticStore.getState();
            startDialecticSession(startSessionPayload);
            expect(useDialecticStore.getState().isStartingSession).toBe(true);
            expect(useDialecticStore.getState().startSessionError).toBeNull();
        });
    });

    describe('fetchAIModelCatalog action', () => {
        it('should fetch and set AI model catalog on success', async () => {
            const mockCatalog: AIModelCatalogEntry[] = [
                { id: 'model1', provider_name: 'OpenAI', model_name: 'GPT-4', api_identifier: 'gpt-4' } as AIModelCatalogEntry,
                { id: 'model2', provider_name: 'Anthropic', model_name: 'Claude 3', api_identifier: 'claude-3' } as AIModelCatalogEntry,
            ];
            const mockResponse: ApiResponse<AIModelCatalogEntry[]> = { data: mockCatalog, status: 200 };
            mockDialecticApi.listModelCatalog.mockResolvedValue(mockResponse);

            const { fetchAIModelCatalog } = useDialecticStore.getState();
            await fetchAIModelCatalog();

            const state = useDialecticStore.getState();
            expect(state.isLoadingModelCatalog).toBe(false);
            expect(state.modelCatalog).toEqual(mockCatalog);
            expect(state.modelCatalogError).toBeNull();
            expect(mockDialecticApi.listModelCatalog).toHaveBeenCalledTimes(1);
        });

        it('should set error state if listModelCatalog API returns an error', async () => {
            const mockError: ApiError = { code: 'CATALOG_ERROR', message: 'Failed to fetch model catalog' };
            const mockResponse: ApiResponse<AIModelCatalogEntry[]> = { error: mockError, status: 500 };
            mockDialecticApi.listModelCatalog.mockResolvedValue(mockResponse);

            const { fetchAIModelCatalog } = useDialecticStore.getState();
            await fetchAIModelCatalog();

            const state = useDialecticStore.getState();
            expect(state.isLoadingModelCatalog).toBe(false);
            expect(state.modelCatalog).toEqual([]);
            expect(state.modelCatalogError).toEqual(mockError);
        });

        it('should set network error state if listModelCatalog API call throws', async () => {
            const networkErrorMessage = 'Catalog service unavailable';
            mockDialecticApi.listModelCatalog.mockRejectedValue(new Error(networkErrorMessage));

            const { fetchAIModelCatalog } = useDialecticStore.getState();
            await fetchAIModelCatalog();

            const state = useDialecticStore.getState();
            expect(state.isLoadingModelCatalog).toBe(false);
            expect(state.modelCatalog).toEqual([]);
            expect(state.modelCatalogError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });

        it('should set loading state during fetchAIModelCatalog', () => {
            mockDialecticApi.listModelCatalog.mockReturnValue(new Promise(() => {}));
            const { fetchAIModelCatalog } = useDialecticStore.getState();
            fetchAIModelCatalog(); // Do not await
            expect(useDialecticStore.getState().isLoadingModelCatalog).toBe(true);
            expect(useDialecticStore.getState().modelCatalogError).toBeNull();
        });
    });

    describe('setSelectedStageAssociation action', () => {
        it('should update selectedStageAssociation and clear overlay data', () => {
            const { setSelectedStageAssociation, fetchAvailableDomainOverlays } = useDialecticStore.getState();
            
            // Initial fetch to populate some overlay data to ensure it's cleared
            useDialecticStore.setState({
                availableDomainOverlays: [{ id: '1', domainTag: 'test', description: 'test', stageAssociation: 'thesis' }],
                domainOverlaysError: { code: 'ERROR', message: 'some error' },
                isLoadingDomainOverlays: true,
            });

            setSelectedStageAssociation('thesis');
            let state = useDialecticStore.getState();
            expect(state.selectedStageAssociation).toBe('thesis');
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

});