// Import test utilities and types
import { assertSpyCall, assertSpyCalls, spy, stub, type Stub, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Import the function to test AND the dependency interface
import { syncAnthropicModels, type SyncAnthropicDeps } from "./anthropic_sync.ts"; 

// No longer need to import the adapter directly for mocking
// import { anthropicAdapter } from "../_shared/ai_service/anthropic_adapter.ts";

// Import shared types and test utils
// NOTE: getCurrentDbModels is now mocked via deps, but keep types
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

// Helper to create mock dependencies (similar to other tests)
const createMockSyncDeps = (overrides: Partial<SyncAnthropicDeps> = {}): SyncAnthropicDeps => ({
    listProviderModels: spy(async (_apiKey: string): Promise<ProviderModelInfo[]> => []), // Default: empty models
    getCurrentDbModels: spy(async (_client: SupabaseClient, _provider: string): Promise<DbAiProvider[]> => []), // Default: empty DB
    log: spy(() => {}), // Default: no-op spy
    error: spy(() => {}), // Default: no-op spy
    ...overrides,
});

// --- Test Suite ---

Deno.test("syncAnthropicModels", { 
    sanitizeOps: false, 
    sanitizeResources: false, 
}, async (t) => {

    await t.step("should insert new models when DB is empty and adapter returns models", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        try {
            // Mock the API response via deps
            const mockApiModels: ProviderModelInfo[] = [
                { api_identifier: `anthropic-claude-3-opus-20240229`, name: 'Anthropic Claude 3 Opus', description: 'Most powerful model' },
                { api_identifier: `anthropic-claude-3-sonnet-20240229`, name: 'Anthropic Claude 3 Sonnet', description: 'Balanced model' },
            ];
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels),
                getCurrentDbModels: spy(async () => []) // DB empty
            });
            
            // Configure the Supabase mock for INSERT
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        // select handled by mockDeps
                        insert: { data: mockApiModels.map(m => ({ ...m, provider: PROVIDER_NAME, is_active: true, id: crypto.randomUUID() })), error: null, count: mockApiModels.length }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            // Call the function with mock deps
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY, mockDeps);
            
            // Assertions 
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [ANTHROPIC_API_KEY] }); 
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, PROVIDER_NAME] });

            const fromSpy = spies.fromSpy;
            // Only called for INSERT now
            assertEquals(fromSpy.calls.length, 1, "from() should be called once (insert)");

            const insertBuilderSpies = fromSpy.calls[0].returned;
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
            // No stub to restore
        }
    });

    await t.step("should return error result if listProviderModels fails", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        const adapterError = new Error("Anthropic API Key Invalid");
        try {
            // Mock listProviderModels to reject via deps
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(() => Promise.reject(adapterError))
            });
            
            const { client: mockClient, spies } = createMockSupabaseClient();

            // Call the function with mock deps
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY, mockDeps);
            
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [ANTHROPIC_API_KEY] });
            assertSpyCalls(mockDeps.getCurrentDbModels as Spy, 0); // Should not be called
            assertSpyCall(mockDeps.error as Spy, 0); // Error should be logged
            assert((mockDeps.error as Spy).calls[0].args[1] === adapterError);

            // Ensure Supabase was NOT called
            assertEquals(spies.fromSpy.calls.length, 0);

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, adapterError.message); 

        } finally {
            // No stub to restore
        }
    });
    
    await t.step("should return error result if getCurrentDbModels fails", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        const dbSelectError = new Error("DB Connection refused");
        try {
            // Mock adapter to return successfully via deps
             const mockApiModels: ProviderModelInfo[] = [
                { api_identifier: `anthropic-claude-3-opus-20240229`, name: 'Anthropic Claude 3 Opus', description: 'Most powerful model' },
             ];
            // Mock getCurrentDbModels to reject via deps
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels),
                getCurrentDbModels: spy(() => Promise.reject(dbSelectError))
            });

            // Configure Supabase mock (no DB ops expected)
            const { client: mockClient, spies } = createMockSupabaseClient();

            // Call the function with mock deps
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY, mockDeps);

            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [ANTHROPIC_API_KEY] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, PROVIDER_NAME] });
            assertSpyCall(mockDeps.error as Spy, 0); // Error should be logged
            assert((mockDeps.error as Spy).calls[0].args[1] === dbSelectError);

            // No Supabase mutation calls expected
            assertEquals(spies.fromSpy.calls.length, 0);

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, dbSelectError.message);

        } finally {
            // No stub to restore
        }
    });

    // Add other test cases similar to openai_sync.test.ts (no change, db insert/update/deactivate fail, reactivate, empty API)
    // Remember to mock the dependencies (listProviderModels, getCurrentDbModels) appropriately for each case.

    // --- Start: Added Edge Case Tests (Updated for DI) ---

    await t.step("should do nothing if API and DB models match", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        try {
            const commonModel = { api_identifier: `anthropic-claude-3-opus-20240229`, name: 'Anthropic Claude 3 Opus', description: 'Most powerful model' };
            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: commonModel.api_identifier, name: commonModel.name, description: commonModel.description, is_active: true, provider: PROVIDER_NAME },
            ];
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [commonModel]),
                getCurrentDbModels: spy(async () => existingDbModels)
            });

            // Configure Supabase mock (no DB ops expected)
            const { client: mockClient, spies } = createMockSupabaseClient();
            
            // Call function with mock deps
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY, mockDeps);

            assertSpyCall(mockDeps.listProviderModels as Spy, 0);
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0);

            // No Supabase calls expected
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 0, "No Supabase calls should happen");
            
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            // No stub to restore
        }
    });

    await t.step("should return error result if DB insert fails", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        const dbError = { message: "Insert failed", code: "23505" };
        try {
            // Ensure description is undefined, not null, to match ProviderModelInfo type
            const mockApiModels = [{ api_identifier: `anthropic-claude-new`, name: 'Anthropic New', description: undefined }];
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels),
                getCurrentDbModels: spy(async () => []) // DB empty
            });

            // Configure Supabase mock for INSERT failure
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        // select handled by mockDeps
                        insert: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            // Call function with mock deps
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY, mockDeps);

            assertSpyCall(mockDeps.listProviderModels as Spy, 0);
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0);
            assertSpyCall(mockDeps.error as Spy, 0); // Log the DB error
            assertEquals((mockDeps.error as Spy).calls[0].args[1], dbError, "Logged error object should match mock DB error");

            // Check Supabase insert attempt
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1); // Only insert attempt
            assertSpyCall(fromSpy.calls[0].returned.insert, 0);

            // Check SyncResult
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            // The error from sync function should match the dbError message
            assertEquals(result.error, `Insert failed for ${PROVIDER_NAME}: ${dbError.message}`);
        } finally {
            // No stub to restore
        }
    });

     await t.step("should return error result if DB update fails", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        const dbError = { message: "Update failed", code: "xxxxx" };
        const modelId = 'db-id-a1';
        try {
             // Ensure description is undefined, not null, to match ProviderModelInfo type
            const mockApiModels = [{ api_identifier: `anthropic-claude-3-opus-20240229`, name: 'Anthropic Claude 3 Opus UPDATED', description: undefined }];
            const existingDbModels: DbAiProvider[] = [
                { id: modelId, api_identifier: `anthropic-claude-3-opus-20240229`, name: 'Anthropic Claude 3 Opus', description: null, is_active: true, provider: PROVIDER_NAME },
            ];
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels),
                getCurrentDbModels: spy(async () => existingDbModels)
            });

            // Configure Supabase mock for UPDATE failure
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        // select handled by mockDeps
                        update: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            // Call function with mock deps
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY, mockDeps);

            assertSpyCall(mockDeps.listProviderModels as Spy, 0);
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0);
            assertSpyCall(mockDeps.error as Spy, 0); // Log the DB error
            assertEquals((mockDeps.error as Spy).calls[0].args[1], dbError, "Logged error object should match mock DB error");

            // Check Supabase update attempt
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1); // Only update attempt
            assertSpyCall(fromSpy.calls[0].returned.update, 0);
            assertSpyCall(fromSpy.calls[0].returned.eq, 0, { args: ['id', modelId] });

            // Check SyncResult
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            // Final error message caught by the outer block
            assertEquals(result.error, `Update failed for model ID ${modelId} (${PROVIDER_NAME}): ${dbError.message}`);
        } finally {
            // No stub to restore
        }
    });

    // --- End: Added Edge Case Tests ---

    // --- NEW TEST: DB Deactivate Failure ---
    await t.step("should return error result if DB deactivate fails", async () => {
        const mockApiKey = "test-anthropic-key";
        const activeModelIds = ['db-anthropic-deactivate-fail1', 'db-anthropic-deactivate-fail2'];
        const dbDeactivateError = { message: "Anthropic deactivation constraint violation", code: "23504" }; // Example error

        try {
            // Mock API returns empty list
            const apiModels: ProviderModelInfo[] = []; 

            // Mock DB returns active models that need deactivation
            const existingDbModels: DbAiProvider[] = [
                { id: activeModelIds[0], api_identifier: 'anthropic-deactivate-fail1', name: 'Deactivate Fail 1', description: null, is_active: true, provider: 'anthropic' },
                { id: activeModelIds[1], api_identifier: 'anthropic-deactivate-fail2', name: 'Deactivate Fail 2', description: null, is_active: true, provider: 'anthropic' },
            ];
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => apiModels), // API is empty
                getCurrentDbModels: spy(async () => existingDbModels), // DB has active models
            });

            // Configure Supabase mock for UPDATE failure during deactivation
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        update: { data: null, error: dbDeactivateError } // Simulate deactivation failure
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            // Call function - expect error to be caught and returned in result
            const result = await syncAnthropicModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0);
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0);
            
            // Check Supabase deactivate update attempt
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1, "Only one Supabase call (deactivate attempt) should happen");
            const deactivateCall = fromSpy.calls[0];
            assertExists(deactivateCall.returned.update, "Update spy should exist");
            assertSpyCall(deactivateCall.returned.update, 0, { args: [{ is_active: false }] }); // Correct payload
            assertExists(deactivateCall.returned.in, "in spy should exist");
            assertSpyCall(deactivateCall.returned.in, 0); // .in was called
             // Check the IDs passed to .in()
            const inArgs = deactivateCall.returned.in.calls[0].args;
            assertEquals(inArgs[0], 'id');
            assertEquals(inArgs[1]?.length, activeModelIds.length);
            assert(inArgs[1]?.includes(activeModelIds[0]));
            assert(inArgs[1]?.includes(activeModelIds[1]));

            // Check that the error was logged by the outer catch block
            assertSpyCall(mockDeps.error as Spy, 0); 
            const loggedErrorArg = (mockDeps.error as Spy).calls[0].args[1];
            assertEquals(loggedErrorArg, dbDeactivateError, "Logged error object should match the mock DB error"); // Check the raw object
            
            // Check SyncResult
            assertEquals(result.provider, 'anthropic');
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0); 
            assertEquals(result.deactivated, 0); // Deactivation failed
            // Check the error message formatted by the *outer* catch block
            assertEquals(result.error, `Deactivation failed for anthropic: ${dbDeactivateError.message}`);

        } finally { }
    });

}); // End Deno.test suite