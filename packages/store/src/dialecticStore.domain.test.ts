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
  DialecticDomainRow,
  DomainProcessAssociationRow,
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
import { buildFetchProcessAssociationPayload, resetApiMock } from '@paynless/api/mocks';

const fixedCreatedAt: DialecticDomainRow['created_at'] = '2025-01-01T00:00:00.000Z';
const fixedUpdatedAt: DialecticDomainRow['updated_at'] = '2025-01-01T01:00:00.000Z';

const mockDomainRowOne: DialecticDomainRow = {
    id: 'dom1',
    name: 'Software Engineering',
    description: 'The application of engineering principles to software development.',
    parent_domain_id: null,
    is_enabled: true,
    created_at: fixedCreatedAt,
    updated_at: fixedUpdatedAt,
};

const mockDomainRowTwo: DialecticDomainRow = {
    id: 'dom2',
    name: 'Gardening',
    description: 'The practice of growing and cultivating plants as part of horticulture.',
    parent_domain_id: 'dom1',
    is_enabled: true,
    created_at: fixedCreatedAt,
    updated_at: fixedUpdatedAt,
};

const mockAssociationRow: DomainProcessAssociationRow = {
    id: 'association-uuid-default',
    domain_id: 'dom1',
    process_template_id: 'pt-thesis',
    is_default_for_domain: true,
    created_at: fixedCreatedAt,
    updated_at: fixedUpdatedAt,
};

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
        const mockDomains: DialecticDomainRow[] = [mockDomainRowOne, mockDomainRowTwo];

        it('should fetch and set full domain rows on success', async () => {
            const mockResponse: ApiResponse<DialecticDomainRow[]> = { data: mockDomains, status: 200 };
            vi.mocked(api.dialectic().listDomains).mockResolvedValue(mockResponse);

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
            const mockResponse: ApiResponse<DialecticDomainRow[]> = { error: mockError, status: 500 };
            vi.mocked(api.dialectic().listDomains).mockResolvedValue(mockResponse);

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
            vi.mocked(api.dialectic().listDomains).mockRejectedValue(new Error(networkErrorMessage));

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

        it('should reject the entire catalog when one element fails domain row validation', async () => {
            const { created_at: _createdAt, ...partialMissingCreatedAt } = mockDomainRowTwo;
            vi.mocked(api.dialectic().listDomains).mockResolvedValue({
                data: [mockDomainRowOne, partialMissingCreatedAt] as DialecticDomainRow[],
                status: 200,
            });

            const { fetchDomains } = useDialecticStore.getState();
            await fetchDomains();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomains).toBe(false);
            expect(state.domains).toEqual([]);
            expect(state.domainsError).toEqual({
                code: 'INVALID_RESPONSE',
                message: expect.stringContaining('Invalid domain row'),
            });
            expect(api.dialectic().listDomains).toHaveBeenCalledTimes(1);
        });
    });

    describe('setSelectedDomain action', () => {
        it('should update selectedDomain and reset association-dependent pre-project state', () => {
            const { setSelectedDomain } = useDialecticStore.getState();
            const testDomain: DialecticDomainRow = {
                id: 'dom1',
                name: 'Test Domain',
                description: 'A domain for testing.',
                parent_domain_id: null,
                is_enabled: true,
                created_at: fixedCreatedAt,
                updated_at: fixedUpdatedAt,
            };
            
            setSelectedDomain(testDomain);
            let state = useDialecticStore.getState();
            expect(state.selectedDomain).toEqual(testDomain);
            expect(state.selectedDomainProcessAssociation).toBeNull();
            expect(state.preProjectStageExpectedCounts).toBeNull();

            setSelectedDomain(null);
            state = useDialecticStore.getState();
            expect(state.selectedDomain).toBeNull();
            expect(state.selectedDomainProcessAssociation).toBeNull();
            expect(state.preProjectStageExpectedCounts).toBeNull();
        });
    });

    describe('fetchProcessAssociation action', () => {
        it('should store a full default association row on success', async () => {
            const payload = buildFetchProcessAssociationPayload({ domainId: 'dom1' });
            const mockResponse: ApiResponse<DomainProcessAssociationRow> = {
                data: mockAssociationRow,
                status: 200,
            };
            vi.mocked(api.dialectic().fetchProcessAssociation).mockResolvedValue(mockResponse);

            const { fetchProcessAssociation } = useDialecticStore.getState();
            await fetchProcessAssociation(payload);

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainProcessAssociation).toBe(false);
            expect(state.selectedDomainProcessAssociation).toEqual(mockAssociationRow);
            expect(state.domainProcessAssociationError).toBeNull();
            expect(api.dialectic().fetchProcessAssociation).toHaveBeenCalledWith(payload);
        });

        it('should leave association null when the API returns an error', async () => {
            const payload = buildFetchProcessAssociationPayload({ domainId: 'dom1' });
            const mockError: ApiError = { code: 'NOT_FOUND', message: 'No default association for domain' };
            const mockResponse: ApiResponse<DomainProcessAssociationRow> = {
                error: mockError,
                status: 404,
            };
            vi.mocked(api.dialectic().fetchProcessAssociation).mockResolvedValue(mockResponse);

            const { fetchProcessAssociation } = useDialecticStore.getState();
            await fetchProcessAssociation(payload);

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainProcessAssociation).toBe(false);
            expect(state.selectedDomainProcessAssociation).toBeNull();
            expect(state.domainProcessAssociationError).toEqual(mockError);
        });

        it('should leave association null and set error when response data fails association row validation', async () => {
            const payload = buildFetchProcessAssociationPayload({ domainId: 'dom1' });
            const invalidAssociationRow: DomainProcessAssociationRow = {
                ...mockAssociationRow,
                is_default_for_domain: false,
            };
            const mockResponse: ApiResponse<DomainProcessAssociationRow> = {
                data: invalidAssociationRow,
                status: 200,
            };
            vi.mocked(api.dialectic().fetchProcessAssociation).mockResolvedValue(mockResponse);

            const { fetchProcessAssociation } = useDialecticStore.getState();
            await fetchProcessAssociation(payload);

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainProcessAssociation).toBe(false);
            expect(state.selectedDomainProcessAssociation).toBeNull();
            expect(state.domainProcessAssociationError).toEqual({
                code: 'INVALID_RESPONSE',
                message: expect.stringContaining('Invalid process association row'),
            });
        });

        it('should toggle isLoadingDomainProcessAssociation while the request is in flight', async () => {
            const payload = buildFetchProcessAssociationPayload({ domainId: 'dom1' });
            let resolveFetch: (value: ApiResponse<DomainProcessAssociationRow>) => void = () => undefined;
            const fetchPromise: Promise<ApiResponse<DomainProcessAssociationRow>> = new Promise((resolve) => {
                resolveFetch = resolve;
            });
            vi.mocked(api.dialectic().fetchProcessAssociation).mockReturnValue(fetchPromise);

            const { fetchProcessAssociation } = useDialecticStore.getState();
            const pendingFetch = fetchProcessAssociation(payload);

            expect(useDialecticStore.getState().isLoadingDomainProcessAssociation).toBe(true);

            resolveFetch({
                data: mockAssociationRow,
                status: 200,
            });
            await pendingFetch;

            expect(useDialecticStore.getState().isLoadingDomainProcessAssociation).toBe(false);
        });
    });
});
