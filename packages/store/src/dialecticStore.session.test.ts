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
import { api } from '@paynless/api';

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
    let mockDialecticApi: Mock<any, any>;

    beforeEach(() => {
        resetApiMock(); // Resets all mocks defined in @paynless/api/mocks
        mockDialecticApi = api.dialectic as Mock<any, any>; // Get a reference to the dialectic specific mocks
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
            user_input_reference_url: null,
            iteration_count: 1,
            selected_model_catalog_ids: [],
            status: 'pending_thesis',
            associated_chat_id: 'chat-123',
            current_stage_id: 'some-stage-id',
            created_at: '2023-01-01T00:00:00.000Z',
            updated_at: '2023-01-01T00:00:00.000Z',
            dialectic_session_models: [],
        };

        it('should start a session and refetch project details if project_id is present in response', async () => {
            const mockResponse: ApiResponse<DialecticSession> = { data: mockSession, status: 201 };
            (api.dialectic().startSession as Mock).mockResolvedValue(mockResponse);
            const mockProject: DialecticProject = { id: startSessionPayload.projectId } as DialecticProject;
            (api.dialectic().getProjectDetails as Mock).mockResolvedValue({ data: mockProject, status: 200 });
            (api.dialectic().listProjects as Mock).mockResolvedValue({ data: [], status: 200 }); // Still mock for safety, but shouldn't be called

            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toBeNull();
            expect(result.data).toEqual(mockSession);
            expect(api.dialectic().startSession).toHaveBeenCalledWith(startSessionPayload);
            expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(startSessionPayload.projectId);
            expect(api.dialectic().listProjects).not.toHaveBeenCalled();
        });

        it('should start a session and refetch project list if project_id is NOT present in response', async () => {
            const mockSessionWithoutProjectId: DialecticSession = { ...mockSession, project_id: null as any }; // or undefined
            const mockResponse: ApiResponse<DialecticSession> = { data: mockSessionWithoutProjectId, status: 201 };
            (api.dialectic().startSession as Mock).mockResolvedValue(mockResponse);
            (api.dialectic().listProjects as Mock).mockResolvedValue({ data: [], status: 200 });
            // Mock getProjectDetails for safety, but it shouldn't be called
            const mockProject: DialecticProject = { id: "anyID" } as DialecticProject;
            (api.dialectic().getProjectDetails as Mock).mockResolvedValue({ data: mockProject, status: 200 });


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
            (api.dialectic().startSession as Mock).mockResolvedValue(mockResponse);

            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toEqual(mockError);
            expect(result.error).toEqual(mockError);
        });

        it('should set network error state if startSession API call throws', async () => {
            const networkErrorMessage = 'Session service network error';
            (api.dialectic().startSession as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { startDialecticSession } = useDialecticStore.getState();
            const result = await startDialecticSession(startSessionPayload);

            const state = useDialecticStore.getState();
            expect(state.isStartingSession).toBe(false);
            expect(state.startSessionError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
            expect(result.error).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });

        it('should set loading state during startDialecticSession', () => {
            (api.dialectic().startSession as Mock).mockReturnValue(new Promise(() => {}));
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
            (api.dialectic().listModelCatalog as Mock).mockResolvedValue(mockResponse);

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
            (api.dialectic().listModelCatalog as Mock).mockResolvedValue(mockResponse);

            const { fetchAIModelCatalog } = useDialecticStore.getState();
            await fetchAIModelCatalog();

            const state = useDialecticStore.getState();
            expect(state.isLoadingModelCatalog).toBe(false);
            expect(state.modelCatalog).toEqual([]);
            expect(state.modelCatalogError).toEqual(mockError);
        });

        it('should set network error state if listModelCatalog API call throws', async () => {
            const networkErrorMessage = 'Catalog service unavailable';
            (api.dialectic().listModelCatalog as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { fetchAIModelCatalog } = useDialecticStore.getState();
            await fetchAIModelCatalog();

            const state = useDialecticStore.getState();
            expect(state.isLoadingModelCatalog).toBe(false);
            expect(state.modelCatalog).toEqual([]);
            expect(state.modelCatalogError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });

        it('should set loading state during fetchAIModelCatalog', () => {
            (api.dialectic().listModelCatalog as Mock).mockReturnValue(new Promise(() => {}));
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
                availableDomainOverlays: [{ id: '1', domainId: 'domain-1', domainName: 'Test Domain', description: 'test', stageAssociation: 'thesis', overlay_values: {} }],
                domainOverlaysError: { code: 'ERROR', message: 'some error' },
                isLoadingDomainOverlays: true,
            });

            const mockStage = { id: 'stage-1', slug: 'thesis' } as any;
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

});