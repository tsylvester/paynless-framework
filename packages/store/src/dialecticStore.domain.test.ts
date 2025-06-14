import { 
    describe, 
    it, 
    expect, 
    beforeEach, 
    vi,
    type Mock
} from 'vitest';
import { 
    useDialecticStore, 
} from './dialecticStore';
import type { 
  ApiError, 
  ApiResponse, 
  DomainOverlayDescriptor,
  DialecticDomain,
  DialecticStage,
} from '@paynless/types';

vi.mock('@paynless/api', async (importOriginal) => {
    const original = await importOriginal() as Record<string, unknown>;
    const { api } = await import('@paynless/api/mocks'); 
    
    return {
        ...original,
        api, 
        initializeApiClient: vi.fn(), 
    };
});

import { api } from '@paynless/api';
import { resetApiMock } from '@paynless/api/mocks';

describe('useDialecticStore', () => {

    beforeEach(() => {
        resetApiMock(); 
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks();
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

    describe('fetchDomains action', () => {
        const mockDomains: DialecticDomain[] = [
            { id: 'dom1', name: 'Software Engineering', description: 'The application of engineering principles to software development.', parent_domain_id: null },
            { id: 'dom2', name: 'Gardening', description: 'The practice of growing and cultivating plants as part of horticulture.', parent_domain_id: 'dom1' }
        ];

        it('should fetch and set domains on success', async () => {
            const mockResponse: ApiResponse<DialecticDomain[]> = { data: mockDomains, status: 200 };
            (api.dialectic().listDomains as Mock).mockResolvedValue(mockResponse);

            const { fetchDomains } = useDialecticStore.getState();
            await fetchDomains();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomains).toBe(false);
            expect(state.domains).toEqual(mockDomains);
            expect(state.domainsError).toBeNull();
            expect(api.dialectic().listDomains).toHaveBeenCalledTimes(1);
        });

        it('should set error state if API returns an error', async () => {
            const mockError: ApiError = { code: 'DOMAIN_API_FAIL', message: 'API failed for domains' };
            const mockResponse: ApiResponse<DialecticDomain[]> = { error: mockError, status: 500 };
            (api.dialectic().listDomains as Mock).mockResolvedValue(mockResponse);

            const { fetchDomains } = useDialecticStore.getState();
            await fetchDomains();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomains).toBe(false);
            expect(state.domains).toEqual([]);
            expect(state.domainsError).toEqual(mockError);
            expect(api.dialectic().listDomains).toHaveBeenCalledTimes(1);
        });

        it('should set network error state if API call throws', async () => {
            const networkErrorMessage = 'Network is down';
            (api.dialectic().listDomains as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { fetchDomains } = useDialecticStore.getState();
            await fetchDomains();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomains).toBe(false);
            expect(state.domains).toEqual([]);
            expect(state.domainsError).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(api.dialectic().listDomains).toHaveBeenCalledTimes(1);
        });
    });

    describe('setSelectedDomain action', () => {
        it('should update selectedDomain in the state', () => {
            const { setSelectedDomain } = useDialecticStore.getState();
            const testDomain: DialecticDomain = { id: 'dom1', name: 'Test Domain', description: 'A domain for testing.', parent_domain_id: null };
            
            setSelectedDomain(testDomain);
            let state = useDialecticStore.getState();
            expect(state.selectedDomain).toEqual(testDomain);

            setSelectedDomain(null);
            state = useDialecticStore.getState();
            expect(state.selectedDomain).toBeNull();
        });
    });

    describe('fetchAvailableDomainOverlays action', () => {
        const stageSlug = 'thesis';
        const mockStage: DialecticStage = {
            id: 'stage-1',
            slug: stageSlug,
            display_name: 'Thesis',
            description: 'The first stage',
            created_at: new Date().toISOString(),
            default_system_prompt_id: null,
            expected_output_artifacts: null,
            input_artifact_rules: null,
        };

        const mockOverlays: DomainOverlayDescriptor[] = [
            { id: 'ov1', domainId: 'dom1', domainName: 'Software Development', description: 'Desc 1', stageAssociation: 'thesis', overlay_values: {} },
            { id: 'ov2', domainId: 'dom1', domainName: 'Software Development', description: null, stageAssociation: 'thesis', overlay_values: {} },
        ];

        it('should fetch and set domain overlays on success', async () => {
            const mockResponse: ApiResponse<DomainOverlayDescriptor[]> = { data: mockOverlays, status: 200 };
            (api.dialectic().listAvailableDomainOverlays as Mock).mockResolvedValue(mockResponse);

            const { fetchAvailableDomainOverlays } = useDialecticStore.getState();
            await fetchAvailableDomainOverlays(mockStage);

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainOverlays).toBe(false);
            expect(state.availableDomainOverlays).toEqual(mockOverlays);
            expect(state.selectedStageAssociation).toEqual(mockStage);
            expect(state.domainOverlaysError).toBeNull();
            expect(api.dialectic().listAvailableDomainOverlays).toHaveBeenCalledTimes(1);
            expect(api.dialectic().listAvailableDomainOverlays).toHaveBeenCalledWith({ stageAssociation: stageSlug });
        });

        it('should set error state if API returns an error', async () => {
            const mockError: ApiError = { code: 'OVERLAY_API_FAIL', message: 'API failed for overlays' };
            const mockResponse: ApiResponse<DomainOverlayDescriptor[]> = { error: mockError, status: 500 };
            (api.dialectic().listAvailableDomainOverlays as Mock).mockResolvedValue(mockResponse);

            const { fetchAvailableDomainOverlays } = useDialecticStore.getState();
            await fetchAvailableDomainOverlays(mockStage);

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainOverlays).toBe(false);
            expect(state.availableDomainOverlays).toEqual([]);
            expect(state.selectedStageAssociation).toEqual(mockStage);
            expect(state.domainOverlaysError).toEqual(mockError);
            expect(api.dialectic().listAvailableDomainOverlays).toHaveBeenCalledTimes(1);
        });

        it('should set network error state if API call throws', async () => {
            const networkErrorMessage = 'Network down for overlays';
            (api.dialectic().listAvailableDomainOverlays as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { fetchAvailableDomainOverlays } = useDialecticStore.getState();
            await fetchAvailableDomainOverlays(mockStage);

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainOverlays).toBe(false);
            expect(state.availableDomainOverlays).toEqual([]);
            expect(state.selectedStageAssociation).toEqual(mockStage);
            expect(state.domainOverlaysError).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(api.dialectic().listAvailableDomainOverlays).toHaveBeenCalledTimes(1);
        });

        it('should set loading state during fetch', async () => {
            (api.dialectic().listAvailableDomainOverlays as Mock).mockReturnValue(new Promise(() => {})); // Non-resolving promise

            const { fetchAvailableDomainOverlays } = useDialecticStore.getState();
            fetchAvailableDomainOverlays(mockStage); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainOverlays).toBe(true);
            expect(state.selectedStageAssociation).toEqual(mockStage);
            expect(state.domainOverlaysError).toBeNull();
            expect(api.dialectic().listAvailableDomainOverlays).toHaveBeenCalledTimes(1);
        });
         it('should clear previous overlays when starting a new fetch', async () => {
            useDialecticStore.setState({
                availableDomainOverlays: [{ id: 'old1', domainId: 'dom_old', domainName: 'Old Domain', description: 'Old desc', stageAssociation: 'synthesis', overlay_values: {} }],
                isLoadingDomainOverlays: false,
                domainOverlaysError: null,
                selectedStageAssociation: { ...mockStage, slug: 'synthesis' }
            });
            
            const mockResponse: ApiResponse<DomainOverlayDescriptor[]> = { data: mockOverlays, status: 200 };
            (api.dialectic().listAvailableDomainOverlays as Mock).mockResolvedValue(mockResponse);

            const { fetchAvailableDomainOverlays } = useDialecticStore.getState();
            
            const initialState = useDialecticStore.getState();
            expect(initialState.availableDomainOverlays!.length).toBe(1);

            const promise = fetchAvailableDomainOverlays(mockStage);

            const loadingState = useDialecticStore.getState();
            expect(loadingState.isLoadingDomainOverlays).toBe(true);
            expect(loadingState.availableDomainOverlays).toEqual([]);

            await promise;

            const finalState = useDialecticStore.getState();
            expect(finalState.isLoadingDomainOverlays).toBe(false);
            expect(finalState.availableDomainOverlays).toEqual(mockOverlays);
            expect(finalState.selectedStageAssociation).toEqual(mockStage);
        });
    });
});