// Import test utilities and types
import { assertSpyCall, assertSpyCalls, spy, stub, type Stub, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Import the function to test
import { syncAnthropicModels } from "./anthropic_sync.ts"; 

// Import the adapter to mock its method
import { anthropicAdapter } from "../_shared/ai_service/anthropic_adapter.ts";

// Import shared types and test utils
import type { DbAiProvider, SyncResult } from "./index.ts"; 
import type { ProviderModelInfo } from "../_shared/types.ts";
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    // setMockFetchResponse, // No longer needed if mocking adapter directly
    // stubFetchForTestScope, // No longer needed if mocking adapter directly
    type MockQueryBuilderState 
} from "../_shared/test-utils.ts";

// Constants for Anthropic
const PROVIDER_NAME = 'anthropic';
const ANTHROPIC_API_KEY = "test-anthropic-key";

// --- Test Suite ---

Deno.test("syncAnthropicModels", { 
    sanitizeOps: false, 
    sanitizeResources: false, 
}, async (t) => {

    await t.step("should insert new models when DB is empty and adapter returns models", async () => {
        let listModelsStub: Stub | undefined;
        try {
            // Mock the adapter response
            const mockApiModels: ProviderModelInfo[] = [
                { api_identifier: `anthropic-claude-3-opus-20240229`, name: 'Anthropic Claude 3 Opus', description: 'Most powerful model' },
                { api_identifier: `anthropic-claude-3-sonnet-20240229`, name: 'Anthropic Claude 3 Sonnet', description: 'Balanced model' },
            ];
            listModelsStub = stub(anthropicAdapter, "listModels", () => Promise.resolve(mockApiModels));
            
            // Configure the Supabase mock
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: [], error: null, count: 0 }, // DB empty
                        insert: { data: mockApiModels.map(m => ({ ...m, provider: PROVIDER_NAME, is_active: true })), error: null, count: mockApiModels.length }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            // Call the function
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY);
            
            // Assertions 
            assertSpyCall(listModelsStub, 0, { args: [ANTHROPIC_API_KEY] }); // Adapter called

            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 2, "from() should be called twice (select, insert)");

            const selectBuilderSpies = fromSpy.calls[0].returned;
            assertSpyCall(selectBuilderSpies.select, 0);
            assertEquals(selectBuilderSpies.eq.calls.length, 1);
            assertSpyCall(selectBuilderSpies.eq, 0, { args: ['provider', PROVIDER_NAME] });

            const insertBuilderSpies = fromSpy.calls[1].returned;
            assertEquals(insertBuilderSpies.insert.calls.length, 1);
            const insertArgs = insertBuilderSpies.insert.calls[0].args[0];
            assertEquals(insertArgs.length, mockApiModels.length);
            assertEquals(insertArgs[0].api_identifier, mockApiModels[0].api_identifier);
            assertEquals(insertArgs[0].name, mockApiModels[0].name);
            assertEquals(insertArgs[0].provider, PROVIDER_NAME);
            assertEquals(insertArgs[1].api_identifier, mockApiModels[1].api_identifier);

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, mockApiModels.length);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);

        } finally {
            listModelsStub?.restore(); // Restore original adapter method
        }
    });

    await t.step("should return error result if adapter call fails", async () => {
        let listModelsStub: Stub | undefined;
        const adapterError = new Error("Anthropic API Key Invalid");
        try {
            // Mock anthropicAdapter.listModels to throw an error
            listModelsStub = stub(anthropicAdapter, "listModels", () => Promise.reject(adapterError));
            
            const { client: mockClient, spies } = createMockSupabaseClient();

            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY);
            
            assertSpyCall(listModelsStub, 0, { args: [ANTHROPIC_API_KEY] });

            // Ensure Supabase was NOT called
            assertEquals(spies.fromSpy.calls.length, 0);

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, adapterError.message); 

        } finally {
            listModelsStub?.restore();
        }
    });
    
    await t.step("should return error result if DB select fails", async () => {
        let listModelsStub: Stub | undefined;
        const dbError = { message: "DB Connection refused", code: "500" };
        try {
            // Mock adapter to return successfully
             const mockApiModels: ProviderModelInfo[] = [
                { api_identifier: `anthropic-claude-3-opus-20240229`, name: 'Anthropic Claude 3 Opus', description: 'Most powerful model' },
             ];
            listModelsStub = stub(anthropicAdapter, "listModels", () => Promise.resolve(mockApiModels));

            // Configure Supabase mock for select error
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                 genericMockResults: {
                    ai_providers: {
                        select: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY);

            assertSpyCall(listModelsStub, 0, { args: [ANTHROPIC_API_KEY] });

            // Check DB call
            assertSpyCall(spies.fromSpy, 0, { args: ['ai_providers'] });
            const queryBuilderSpies = spies.fromSpy.calls[0].returned;
            assertSpyCall(queryBuilderSpies.select, 0); 
            assertSpyCall(queryBuilderSpies.eq, 0, { args: ['provider', PROVIDER_NAME] });

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            // The error should be the stringified DB error object
            assertEquals(result.error, String(dbError));

        } finally {
            listModelsStub?.restore();
        }
    });

    // Add other test cases similar to openai_sync.test.ts (no change, db insert/update/deactivate fail, reactivate, empty API)
    // Remember to stub the anthropicAdapter.listModels call appropriately for each case.

    // --- Start: Added Edge Case Tests ---

    await t.step("should do nothing if API and DB models match", async () => {
        let listModelsStub: Stub | undefined;
        try {
            const commonModel = { api_identifier: `anthropic-claude-3-opus-20240229`, name: 'Anthropic Claude 3 Opus', description: 'Most powerful model' };
            listModelsStub = stub(anthropicAdapter, "listModels", () => Promise.resolve([commonModel]));

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: commonModel.api_identifier, name: commonModel.name, description: commonModel.description, is_active: true, provider: PROVIDER_NAME },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] }); 
            assertEquals(fromSpy.calls.length, 1, "Only select should happen");
            
            const selectSpies = fromSpy.calls[0].returned;
            assertSpyCall(selectSpies.select, 0);
            assertSpyCall(selectSpies.eq, 0, { args: ['provider', PROVIDER_NAME] });
            assertEquals(selectSpies.insert?.calls.length ?? 0, 0);
            assertEquals(selectSpies.update?.calls.length ?? 0, 0);

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            listModelsStub?.restore();
        }
    });

    await t.step("should return error result if DB insert fails", async () => {
        let listModelsStub: Stub | undefined;
        const dbError = { message: "Insert failed", code: "23505" };
        try {
            // Ensure description is undefined, not null, to match ProviderModelInfo type
            const mockApiModels = [{ api_identifier: `anthropic-claude-new`, name: 'Anthropic New', description: undefined }];
            listModelsStub = stub(anthropicAdapter, "listModels", () => Promise.resolve(mockApiModels));

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: [], error: null, count: 0 },
                        insert: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] });
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] });
            assertEquals(fromSpy.calls.length, 2);
            assertSpyCall(fromSpy.calls[1].returned.insert, 0);

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, "[object Object]");
        } finally {
            listModelsStub?.restore();
        }
    });

     await t.step("should return error result if DB update fails", async () => {
        let listModelsStub: Stub | undefined;
        const dbError = { message: "Update failed", code: "xxxxx" };
        try {
             // Ensure description is undefined, not null, to match ProviderModelInfo type
            const mockApiModels = [{ api_identifier: `anthropic-claude-3-opus-20240229`, name: 'Anthropic Claude 3 Opus UPDATED', description: undefined }];
            listModelsStub = stub(anthropicAdapter, "listModels", () => Promise.resolve(mockApiModels));

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: 'anthropic-claude-3-opus-20240229', name: 'Anthropic Claude 3 Opus', description: null, is_active: true, provider: PROVIDER_NAME },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 },
                        update: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] });
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] });
            assertEquals(fromSpy.calls.length, 2);
            assertSpyCall(fromSpy.calls[1].returned.update, 0);
            assertSpyCall(fromSpy.calls[1].returned.eq, 0, { args: ['id', 'db-id-1'] });

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, "[object Object]");
        } finally {
            listModelsStub?.restore();
        }
    });
    
     await t.step("should return error result if DB deactivate fails", async () => {
        let listModelsStub: Stub | undefined;
        const dbError = { message: "Deactivation failed", code: "xxxxx" };
        try {
            listModelsStub = stub(anthropicAdapter, "listModels", () => Promise.resolve([])); // Empty API response

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: 'anthropic-claude-old', name: 'Claude Old', description: null, is_active: true, provider: PROVIDER_NAME },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 },
                        update: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] });
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] });
            assertEquals(fromSpy.calls.length, 2);

            const deactivateSpies = fromSpy.calls[1].returned;
            assertSpyCall(deactivateSpies.update, 0, { args: [{ is_active: false }] });
            assertSpyCall(deactivateSpies.in, 0, { args: ['id', ['db-id-1']] });

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, "[object Object]");
        } finally {
            listModelsStub?.restore();
        }
    });

     await t.step("should reactivate inactive model if it reappears in API", async () => {
        let listModelsStub: Stub | undefined;
        try {
             const mockApiModels = [{ api_identifier: `anthropic-claude-3-opus-20240229`, name: 'Anthropic Claude 3 Opus', description: 'Most powerful model' }];
            listModelsStub = stub(anthropicAdapter, "listModels", () => Promise.resolve(mockApiModels));

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: 'anthropic-claude-3-opus-20240229', name: 'Anthropic Claude 3 Opus', description: null, is_active: false, provider: PROVIDER_NAME },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 },
                        update: { data: [{ id: 'db-id-1', is_active: true }], error: null, count: 1 }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] });
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] });
            assertEquals(fromSpy.calls.length, 2);

            const updateSpies = fromSpy.calls[1].returned;
            assertSpyCall(updateSpies.update, 0);
            assertEquals(updateSpies.update.calls[0].args[0], { description: 'Most powerful model', is_active: true });
            assertSpyCall(updateSpies.eq, 0, { args: ['id', 'db-id-1'] });

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 1);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            listModelsStub?.restore();
        }
    });

    await t.step("should deactivate all active models if API returns empty", async () => {
        let listModelsStub: Stub | undefined;
        try {
            listModelsStub = stub(anthropicAdapter, "listModels", () => Promise.resolve([])); // Empty API response

            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: 'anthropic-claude-4', name: 'Anthropic Claude 4', description: null, is_active: true, provider: PROVIDER_NAME },
                { id: 'db-id-2', api_identifier: 'anthropic-claude-old', name: 'Anthropic Claude Old', description: null, is_active: true, provider: PROVIDER_NAME },
                { id: 'db-id-3', api_identifier: 'anthropic-claude-inactive', name: 'Anthropic Inactive', description: null, is_active: false, provider: PROVIDER_NAME },
            ];

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: existingDbModels.length },
                        update: { data: [{ id: 'db-id-1', is_active: false }, { id: 'db-id-2', is_active: false }], error: null, count: 2 } 
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY);

            assertSpyCall(listModelsStub, 0);
            const fromSpy = spies.fromSpy;
            assertSpyCall(fromSpy, 0, { args: ['ai_providers'] });
            assertSpyCall(fromSpy, 1, { args: ['ai_providers'] });
            assertEquals(fromSpy.calls.length, 2);

            const deactivateSpies = fromSpy.calls[1].returned;
            assertSpyCall(deactivateSpies.update, 0, { args: [{ is_active: false }] });
            assertSpyCall(deactivateSpies.in, 0);
            assertEquals(deactivateSpies.in.calls[0].args[0], 'id'); 
            assertEquals(deactivateSpies.in.calls[0].args[1]?.length, 2);
            assert(deactivateSpies.in.calls[0].args[1]?.includes('db-id-1'));
            assert(deactivateSpies.in.calls[0].args[1]?.includes('db-id-2'));

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 2); // Only the 2 initially active models
            assertEquals(result.error, undefined);
        } finally {
            listModelsStub?.restore();
        }
    });

    // --- End: Added Edge Case Tests ---

}); 