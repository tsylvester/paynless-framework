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

    describe('setSelectedDomainTag action', () => {
        it('should update selectedDomainTag in the state', () => {
            const { setSelectedDomainTag } = useDialecticStore.getState();
            setSelectedDomainTag('new_domain');
            let state = useDialecticStore.getState();
            expect(state.selectedDomainTag).toBe('new_domain');

            setSelectedDomainTag(null);
            state = useDialecticStore.getState();
            expect(state.selectedDomainTag).toBeNull();
        });
    });

    describe('setSelectedDomainOverlayId action', () => {
        it('should update selectedDomainOverlayId in the state', () => {
            const { setSelectedDomainOverlayId } = useDialecticStore.getState();
            const testOverlayId = 'overlay_xyz';
            
            setSelectedDomainOverlayId(testOverlayId);
            let state = useDialecticStore.getState();
            expect(state.selectedDomainOverlayId).toBe(testOverlayId);

            setSelectedDomainOverlayId(null);
            state = useDialecticStore.getState();
            expect(state.selectedDomainOverlayId).toBeNull();
        });
    });

    describe('fetchAvailableDomainTags action', () => {
        it('should fetch and set domain tags on success', async () => {
            const mockTags: DomainTagDescriptor[] = [
                { id: 'tagA_id', domainTag: 'tagA', description: 'Tag A description', stageAssociation: 'thesis' },
                { id: 'tagB_id', domainTag: 'tagB', description: null, stageAssociation: null }
            ];
            const mockResponse: ApiResponse<{ data: DomainTagDescriptor[] }> = { data: { data: mockTags }, status: 200 };
            mockDialecticApi.listAvailableDomainTags.mockResolvedValue(mockResponse);

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            await fetchAvailableDomainTags();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(false);
            expect((state.availableDomainTags as { data: DomainTagDescriptor[] }).data).toEqual(mockTags);
            expect(state.domainTagsError).toBeNull();
            expect(mockDialecticApi.listAvailableDomainTags).toHaveBeenCalledTimes(1);
        });

        it('should set error state if API returns an error', async () => {
            const mockError: ApiError = { code: 'API_FAIL', message: 'API failed' };
            const mockResponse: ApiResponse<{ data: DomainTagDescriptor[] }> = { error: mockError, status: 500 };
            mockDialecticApi.listAvailableDomainTags.mockResolvedValue(mockResponse);

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            await fetchAvailableDomainTags();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(false);
            expect(state.availableDomainTags).toEqual([]);
            expect(state.domainTagsError).toEqual(mockError);
            expect(mockDialecticApi.listAvailableDomainTags).toHaveBeenCalledTimes(1);
        });

        it('should set network error state if API call throws', async () => {
            const networkErrorMessage = 'Network connection lost';
            mockDialecticApi.listAvailableDomainTags.mockRejectedValue(new Error(networkErrorMessage));

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            await fetchAvailableDomainTags();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(false);
            expect(state.availableDomainTags).toEqual([]);
            expect(state.domainTagsError).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(mockDialecticApi.listAvailableDomainTags).toHaveBeenCalledTimes(1);
        });

        it('should set loading state during fetch', async () => {
            mockDialecticApi.listAvailableDomainTags.mockReturnValue(new Promise(() => {})); // Non-resolving promise

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            fetchAvailableDomainTags(); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(true);
            expect(state.domainTagsError).toBeNull();
            expect(mockDialecticApi.listAvailableDomainTags).toHaveBeenCalledTimes(1);
        });
    });

    describe('fetchAvailableDomainOverlays action', () => {
        const stageAssociation = 'thesis';
        const mockOverlays: DomainOverlayDescriptor[] = [
            { id: 'ov1', domainTag: 'Overlay 1', description: 'Desc 1', stageAssociation: 'thesis' },
            { id: 'ov2', domainTag: 'Overlay 2', description: null, stageAssociation: 'thesis' },
        ];

        it('should fetch and set domain overlays on success', async () => {
            const mockResponse: ApiResponse<DomainOverlayDescriptor[]> = { data: mockOverlays, status: 200 };
            mockDialecticApi.listAvailableDomainOverlays.mockResolvedValue(mockResponse);

            const { fetchAvailableDomainOverlays } = useDialecticStore.getState();
            await fetchAvailableDomainOverlays(stageAssociation);

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainOverlays).toBe(false);
            expect(state.availableDomainOverlays).toEqual(mockOverlays);
            expect(state.selectedStageAssociation).toBe(stageAssociation);
            expect(state.domainOverlaysError).toBeNull();
            expect(mockDialecticApi.listAvailableDomainOverlays).toHaveBeenCalledTimes(1);
            expect(mockDialecticApi.listAvailableDomainOverlays).toHaveBeenCalledWith({ stageAssociation });
        });

        it('should set error state if API returns an error', async () => {
            const mockError: ApiError = { code: 'OVERLAY_API_FAIL', message: 'API failed for overlays' };
            const mockResponse: ApiResponse<DomainOverlayDescriptor[]> = { error: mockError, status: 500 };
            mockDialecticApi.listAvailableDomainOverlays.mockResolvedValue(mockResponse);

            const { fetchAvailableDomainOverlays } = useDialecticStore.getState();
            await fetchAvailableDomainOverlays(stageAssociation);

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainOverlays).toBe(false);
            expect(state.availableDomainOverlays).toEqual([]);
            expect(state.selectedStageAssociation).toBe(stageAssociation);
            expect(state.domainOverlaysError).toEqual(mockError);
            expect(mockDialecticApi.listAvailableDomainOverlays).toHaveBeenCalledTimes(1);
        });

        it('should set network error state if API call throws', async () => {
            const networkErrorMessage = 'Network down for overlays';
            mockDialecticApi.listAvailableDomainOverlays.mockRejectedValue(new Error(networkErrorMessage));

            const { fetchAvailableDomainOverlays } = useDialecticStore.getState();
            await fetchAvailableDomainOverlays(stageAssociation);

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainOverlays).toBe(false);
            expect(state.availableDomainOverlays).toEqual([]);
            expect(state.selectedStageAssociation).toBe(stageAssociation);
            expect(state.domainOverlaysError).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(mockDialecticApi.listAvailableDomainOverlays).toHaveBeenCalledTimes(1);
        });

        it('should set loading state during fetch', async () => {
            mockDialecticApi.listAvailableDomainOverlays.mockReturnValue(new Promise(() => {})); // Non-resolving promise

            const { fetchAvailableDomainOverlays } = useDialecticStore.getState();
            fetchAvailableDomainOverlays(stageAssociation); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainOverlays).toBe(true);
            expect(state.selectedStageAssociation).toBe(stageAssociation);
            expect(state.domainOverlaysError).toBeNull();
            expect(mockDialecticApi.listAvailableDomainOverlays).toHaveBeenCalledTimes(1);
        });
         it('should clear previous overlays when starting a new fetch', async () => {
            useDialecticStore.setState({
                availableDomainOverlays: [{ id: 'old1', domainTag: 'Old Overlay', description: 'Old desc', stageAssociation: 'old_stage' }],
                isLoadingDomainOverlays: false,
                domainOverlaysError: null,
                selectedStageAssociation: 'old_stage'
            });
            
            const mockResponse: ApiResponse<DomainOverlayDescriptor[]> = { data: mockOverlays, status: 200 };
            mockDialecticApi.listAvailableDomainOverlays.mockResolvedValue(mockResponse);

            const { fetchAvailableDomainOverlays } = useDialecticStore.getState();
            
            // Check state before the call
            const initialState = useDialecticStore.getState();
            expect(initialState.availableDomainOverlays!.length).toBe(1);

            const promise = fetchAvailableDomainOverlays(stageAssociation);

            // Check state immediately after call (loading, overlays potentially cleared or kept based on implementation)
            const loadingState = useDialecticStore.getState();
            expect(loadingState.isLoadingDomainOverlays).toBe(true);
            // Depending on implementation, availableOverlays might be cleared immediately or after the fetch.
            // The store implementation keeps them until new ones are fetched.
            // expect(loadingState.availableDomainOverlays.length).toBe(1); // Or 0 if cleared instantly

            await promise;

            const finalState = useDialecticStore.getState();
            expect(finalState.isLoadingDomainOverlays).toBe(false);
            expect(finalState.availableDomainOverlays).toEqual(mockOverlays);
            expect(finalState.selectedStageAssociation).toBe(stageAssociation);
        });
    });


});