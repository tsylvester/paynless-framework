import { assertEquals, assertExists, assertArrayIncludes } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.192.0/testing/bdd.ts";

import { listAvailableDomainTags } from './listAvailableDomainTags.ts';
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    type IMockSupabaseClient,
    type MockSupabaseClientSetup
} from '../_shared/supabase.mock.ts';
import { DomainOverlayItem } from "../_shared/domain-utils.ts"; // Import for type casting if needed

describe('listAvailableDomainTags', () => {
    let mockSupabaseSetup: MockSupabaseClientSetup;
    let mockDbClient: IMockSupabaseClient;

    beforeEach(() => {
        // Default config, can be overridden in tests
        const defaultConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                domain_specific_prompt_overlays: {
                    select: async () => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' })
                }
            }
        };
        mockSupabaseSetup = createMockSupabaseClient('test-user-id', defaultConfig);
        mockDbClient = mockSupabaseSetup.client;
    });

    afterEach(() => {
        if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) {
            mockSupabaseSetup.clearAllStubs();
        }
    });

    it('should return distinct domain tags successfully', async () => {
        const mockData: Partial<DomainOverlayItem>[] = [
            { domain_tag: 'tech' }, 
            { domain_tag: 'health' }, 
            { domain_tag: 'tech' }, // Duplicate
            { domain_tag: 'finance' },
            { domain_tag: null }, // Should be filtered by DB query, but test robustness
            { domain_tag: 'health' }
        ];
        
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                domain_specific_prompt_overlays: {
                    // The actual .neq('domain_tag', null) is part of the SUT's query.
                    // The mock here just returns the data as if the query already ran.
                    // extractDistinctDomainTags in the SUT will handle the final distinct logic.
                    select: async () => ({ data: mockData.filter(d => d.domain_tag !== null), error: null, count: mockData.length, status: 200, statusText: 'OK' })
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient('test-user-id', config);
        mockDbClient = mockSupabaseSetup.client;

        const result = await listAvailableDomainTags(mockDbClient as any);

        assertExists(result.data);
        assertEquals(result.error, undefined);
        assertEquals(result.data.length, 3);
        assertArrayIncludes(result.data, ['tech', 'health', 'finance']);
    });

    it('should return an error if database fetch fails', async () => {
        const dbError = { name: 'DatabaseError', message: 'Failed to fetch', code: 'XYZ' };
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                domain_specific_prompt_overlays: {
                    select: async () => ({ data: null, error: dbError as Error, count: 0, status: 500, statusText: 'Error' })
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient('test-user-id', config);
        mockDbClient = mockSupabaseSetup.client;

        const result = await listAvailableDomainTags(mockDbClient as any);

        assertExists(result.error);
        assertEquals(result.data, undefined);
        assertEquals(result.error.message, 'Failed to fetch domain tags');
        assertEquals(result.error.details, dbError.message);
        assertEquals(result.error.status, 500);
        assertEquals(result.error.code, 'DB_FETCH_ERROR');
    });

    it('should return an empty array if no domain tags are found', async () => {
        // Default config in beforeEach already covers this (returns empty array)
        const result = await listAvailableDomainTags(mockDbClient as any);

        assertExists(result.data);
        assertEquals(result.error, undefined);
        assertEquals(result.data.length, 0);
    });

    it('should handle null domain_tags from DB gracefully (though filtered by query)', async () => {
        // This tests the extractDistinctDomainTags robustness if nulls somehow pass the .neq query
        const mockDataWithActualNulls: Partial<DomainOverlayItem>[] = [
            { domain_tag: 'art' }, 
            { domain_tag: null }, 
            { domain_tag: 'science' }
        ]; 
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                domain_specific_prompt_overlays: {
                    // Simulate the DB returning some rows that might have nulls, despite neq.
                    // The SUT's extractDistinctDomainTags should correctly process this.
                    select: async () => ({ data: mockDataWithActualNulls, error: null, count: mockDataWithActualNulls.length, status: 200, statusText: 'OK' })
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient('test-user-id', config);
        mockDbClient = mockSupabaseSetup.client;

        const result = await listAvailableDomainTags(mockDbClient as any);

        assertExists(result.data);
        assertEquals(result.error, undefined);
        assertEquals(result.data.length, 2); // 'art', 'science'
        assertArrayIncludes(result.data, ['art', 'science']);
    });
});
