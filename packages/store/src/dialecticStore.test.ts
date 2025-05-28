import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDialecticStore, initialDialecticStateValues } from './dialecticStore';
// Selectors are no longer tested here
import type { ApiError, ApiResponse } from '@paynless/types';

// Mock the @paynless/api module FIRST
const mockListAvailableDomainTagsFn = vi.fn();
vi.mock('@paynless/api', async () => {
    const actual = await vi.importActual<typeof import('@paynless/api')>('@paynless/api');
    return {
        // Preserve other exports from the actual module if needed by the store
        ...actual, 
        api: { // Deep merge/override for the api object
            ...actual.api,
            dialectic: () => ({
                // Ensure this is the vi.fn() instance we can control in tests
                listAvailableDomainTags: mockListAvailableDomainTagsFn,
            }),
        },
    };
});

// NOW import api AFTER the mock is set up
// It will be the mocked version.
import { api } from '@paynless/api';

describe('useDialecticStore', () => {
    beforeEach(() => {
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks(); // Clears call counts etc. from mockListAvailableDomainTagsFn
        // mockListAvailableDomainTagsFn.mockReset(); // Resets mock implementation and resolved values too, if needed per test
    });

    describe('Initial State', () => {
        it('should initialize with default values', () => {
            const state = useDialecticStore.getState();
            expect(state.availableDomainTags).toEqual([]);
            expect(state.isLoadingDomainTags).toBe(false);
            expect(state.domainTagsError).toBeNull();
            expect(state.selectedDomainTag).toBeNull();
        });
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

    describe('fetchAvailableDomainTags action', () => {
        // mockListAvailableDomainTagsFn is already the correct vi.fn() due to the module mock

        it('should fetch and set domain tags on success', async () => {
            const mockTags = ['tagA', 'tagB'];
            const mockResponse: ApiResponse<string[]> = { data: mockTags, status: 200 };
            mockListAvailableDomainTagsFn.mockResolvedValue(mockResponse);

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            await fetchAvailableDomainTags();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(false);
            expect(state.availableDomainTags).toEqual(mockTags);
            expect(state.domainTagsError).toBeNull();
            expect(mockListAvailableDomainTagsFn).toHaveBeenCalledTimes(1);
        });

        it('should set error state if API returns an error', async () => {
            const mockError: ApiError = { code: 'API_FAIL', message: 'API failed' };
            const mockResponse: ApiResponse<string[]> = { error: mockError, status: 500 };
            mockListAvailableDomainTagsFn.mockResolvedValue(mockResponse);

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            await fetchAvailableDomainTags();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(false);
            expect(state.availableDomainTags).toEqual([]);
            expect(state.domainTagsError).toEqual(mockError);
            expect(mockListAvailableDomainTagsFn).toHaveBeenCalledTimes(1);
        });

        it('should set network error state if API call throws', async () => {
            const networkErrorMessage = 'Network connection lost';
            mockListAvailableDomainTagsFn.mockRejectedValue(new Error(networkErrorMessage));

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            await fetchAvailableDomainTags();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(false);
            expect(state.availableDomainTags).toEqual([]);
            expect(state.domainTagsError).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(mockListAvailableDomainTagsFn).toHaveBeenCalledTimes(1);
        });

        it('should set loading state during fetch', async () => {
            mockListAvailableDomainTagsFn.mockReturnValue(new Promise(() => {})); // Non-resolving promise

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            fetchAvailableDomainTags(); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(true);
            expect(state.domainTagsError).toBeNull();
            expect(mockListAvailableDomainTagsFn).toHaveBeenCalledTimes(1); // It is called
        });
    });
}); 