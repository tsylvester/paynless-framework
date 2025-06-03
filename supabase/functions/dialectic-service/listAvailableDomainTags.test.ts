import { assertEquals, assertExists, assertArrayIncludes } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.192.0/testing/bdd.ts";

import { listAvailableDomainTags, type DomainTagDescriptor } from './listAvailableDomainTags.ts';
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
        const mockRawDataFromDb: { id: string; domain_tag: string | null; description: string | null; system_prompts: { stage_association: string | null }[] | null }[] = [
            { id: '1', domain_tag: 'tech', description: 'Tech stuff', system_prompts: [{ stage_association: 'dev' }] },
            { id: '2', domain_tag: 'health', description: 'Health stuff', system_prompts: null },
            { id: '3', domain_tag: 'tech', description: 'More tech', system_prompts: [{ stage_association: 'research' }] }, // Duplicate domain_tag, but different ID/desc
            { id: '4', domain_tag: 'finance', description: 'Finance stuff', system_prompts: [] },
            { id: '5', domain_tag: null, description: 'Null tag', system_prompts: null }, // Should be filtered by DB query in SUT
            { id: '6', domain_tag: 'health', description: 'More health', system_prompts: [{ stage_association: 'user' }] }
        ];

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                domain_specific_prompt_overlays: {
                    select: async () => ({
                        data: mockRawDataFromDb.filter(d => d.domain_tag !== null), // Simulate SUT's .neq('domain_tag', null)
                        error: null,
                        count: mockRawDataFromDb.filter(d => d.domain_tag !== null).length,
                        status: 200,
                        statusText: 'OK'
                    })
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient('test-user-id', config);
        mockDbClient = mockSupabaseSetup.client;

        const result = await listAvailableDomainTags(mockDbClient as any);

        assertExists(result.data);
        assertEquals(result.error, undefined);
        // The SUT transforms and ensures uniqueness based on domainTag
        const expectedDomainTags = ['tech', 'health', 'finance'];
        assertEquals(result.data.length, expectedDomainTags.length);

        const actualDomainTags = result.data.map((d: DomainTagDescriptor) => d.domainTag);
        assertArrayIncludes(actualDomainTags, expectedDomainTags);

        // Optionally, check other properties if necessary, e.g., that one of the 'tech' descriptors was correctly mapped
        const techDescriptor = result.data.find((d: DomainTagDescriptor) => d.domainTag === 'tech');
        assertExists(techDescriptor);
        // assertEquals(techDescriptor?.description, 'Tech stuff'); // Or based on how SUT selects/merges
        // assertEquals(techDescriptor?.stageAssociation, 'dev');
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
        assertEquals(result.error.message, 'Failed to fetch domain tag descriptors');
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
        const mockDataWithActualNulls: { id: string; domain_tag: string | null; description: string | null; system_prompts: { stage_association: string | null }[] | null }[] = [
            { id: 'd1', domain_tag: 'art', description: 'Art', system_prompts: null },
            { id: 'd2', domain_tag: null, description: 'Null again', system_prompts: null },
            { id: 'd3', domain_tag: 'science', description: 'Science', system_prompts: [{ stage_association: 'exp' }] }
        ];
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                domain_specific_prompt_overlays: {
                    // Simulate the DB returning some rows that might have nulls, despite neq.
                    // The SUT's transformation logic should correctly process this.
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
        
        const expectedDomainTags = ['art', 'science'];
        assertEquals(result.data.length, expectedDomainTags.length);
        
        const actualDomainTags = result.data.map((d: DomainTagDescriptor) => d.domainTag);
        assertArrayIncludes(actualDomainTags, expectedDomainTags);
    });
});
