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
});