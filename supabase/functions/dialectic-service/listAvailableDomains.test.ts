import { assertEquals, assertExists, assertArrayIncludes } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.192.0/testing/bdd.ts";

import { listAvailableDomains, type DomainDescriptor } from './listAvailableDomains.ts';
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    type IMockSupabaseClient,
    type MockSupabaseClientSetup
} from '../_shared/supabase.mock.ts';

describe('listAvailableDomains', () => {
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

    it('should return distinct domain descriptors successfully', async () => {
        const mockRawDataFromDb: { id: string; domain_id: string | null; description: string | null; system_prompts: { stage_association: string | null } | null }[] = [
            { id: '1', domain_id: 'tech', description: 'Tech stuff', system_prompts: { stage_association: 'dev' } },
            { id: '2', domain_id: 'health', description: 'Health stuff', system_prompts: null },
            { id: '3', domain_id: 'tech', description: 'More tech', system_prompts: { stage_association: 'research' } }, // Duplicate domain_id
            { id: '4', domain_id: 'finance', description: 'Finance stuff', system_prompts: null },
            { id: '5', domain_id: null, description: 'Null domain_id', system_prompts: null }, // Should be filtered by DB query in SUT
            { id: '6', domain_id: 'health', description: 'More health', system_prompts: { stage_association: 'user' } } // Duplicate domain_id
        ];

        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                domain_specific_prompt_overlays: {
                    select: async () => ({
                        data: mockRawDataFromDb.filter(d => d.domain_id !== null), // Simulate SUT's .neq('domain_id', null)
                        error: null,
                        count: mockRawDataFromDb.filter(d => d.domain_id !== null).length,
                        status: 200,
                        statusText: 'OK'
                    })
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient('test-user-id', config);
        mockDbClient = mockSupabaseSetup.client;

        const result = await listAvailableDomains(mockDbClient as any);

        if (Array.isArray(result)) {
            assertExists(result);
            const expectedDomainIds = ['tech', 'health', 'finance'];
            assertEquals(result.length, expectedDomainIds.length, "Should return unique domains");

            const actualDomainIds = result.map((d: DomainDescriptor) => d.domainId);
            assertArrayIncludes(actualDomainIds, expectedDomainIds);

            // Check that the first descriptor for 'tech' was kept
            const techDescriptor = result.find((d: DomainDescriptor) => d.domainId === 'tech');
            assertExists(techDescriptor);
            assertEquals(techDescriptor?.id, '1');
            assertEquals(techDescriptor?.description, 'Tech stuff');
            assertEquals(techDescriptor?.stageAssociation, 'dev');
        } else {
            throw new Error(`Test failed: Expected successful data array, got error: ${JSON.stringify((result as { error: unknown }).error)}`);
        }
    });

    it('should return an error if database fetch fails', async () => {
        const dbError = { name: 'DatabaseError', message: 'Failed to fetch', code: 'XYZ', details: '', hint: '' };
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                domain_specific_prompt_overlays: {
                    select: async () => ({ data: null, error: dbError, count: 0, status: 500, statusText: 'Error' })
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient('test-user-id', config);
        mockDbClient = mockSupabaseSetup.client;

        const result = await listAvailableDomains(mockDbClient as any);

        if ('error' in result) {
            assertExists(result.error);
            assertEquals(result.error.message, 'Failed to fetch domain tag descriptors');
            assertEquals(result.error.details, dbError.message);
            assertEquals(result.error.status, 500);
            assertEquals(result.error.code, 'DB_FETCH_ERROR');
        } else {
            throw new Error(`Test failed: Expected error object, got data: ${JSON.stringify(result)}`);
        }
    });

    it('should return an empty array if no domains are found', async () => {
        const result = await listAvailableDomains(mockDbClient as any);

        if (Array.isArray(result)) {
            assertExists(result);
            assertEquals(result.length, 0);
        } else {
            throw new Error(`Test failed: Expected empty data array, got error: ${JSON.stringify((result as { error: unknown }).error)}`);
        }
    });

    it('should handle null domain_ids from DB gracefully (testing internal filter)', async () => {
        const mockDataWithActualNulls: { id: string; domain_id: string | null; description: string | null; system_prompts: { stage_association: string | null } | null }[] = [
            { id: 'd1', domain_id: 'art', description: 'Art', system_prompts: null },
            { id: 'd2', domain_id: null, description: 'Null again', system_prompts: null },
            { id: 'd3', domain_id: 'science', description: 'Science', system_prompts: { stage_association: 'exp' } }
        ];
        const config: MockSupabaseDataConfig = {
            genericMockResults: {
                domain_specific_prompt_overlays: {
                    select: async () => ({ data: mockDataWithActualNulls, error: null, count: mockDataWithActualNulls.length, status: 200, statusText: 'OK' })
                }
            }
        };
        if (mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
        mockSupabaseSetup = createMockSupabaseClient('test-user-id', config);
        mockDbClient = mockSupabaseSetup.client;

        const result = await listAvailableDomains(mockDbClient as any);

        if (Array.isArray(result)) {
            assertExists(result);
            
            const expectedDomainIds = ['art', 'science'];
            assertEquals(result.length, expectedDomainIds.length);
            
            const actualDomainIds = result.map((d: DomainDescriptor) => d.domainId);
            assertArrayIncludes(actualDomainIds, expectedDomainIds);
        } else {
            throw new Error(`Test failed: Expected successful data array, got error: ${JSON.stringify((result as { error: unknown }).error)}`);
        }
    });
});
