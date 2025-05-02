import { assertSpyCall, assertSpyCalls, spy, stub, type Stub, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient, PostgrestResponse, PostgrestSingleResponse, PostgrestMaybeSingleResponse } from "npm:@supabase/supabase-js@2";

// Import the function to test AND the dependency interface
import { syncOpenAIModels, type SyncOpenAIDeps } from "./openai_sync.ts"; 
// Import shared types potentially used
// NOTE: getCurrentDbModels is now mocked via deps, but keep types
import { type SyncResult, type DbAiProvider } from "./index.ts"; 
// Import type for OpenAI API response simulation

// Import shared types and test utils
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    MockQueryBuilderState
} from "../_shared/test-utils.ts";

import { assertThrows } from "jsr:@std/testing/asserts";
import type { AiProviderAdapter, ProviderModelInfo, AiProvider } from "../../../packages/types/src/ai.types.ts";

// Helper to create mock dependencies
const createMockSyncDeps = (overrides: Partial<SyncOpenAIDeps> = {}): SyncOpenAIDeps => ({
    listProviderModels: spy(async (_apiKey: string): Promise<ProviderModelInfo[]> => []), // Default: empty models
    getCurrentDbModels: spy(async (_client: SupabaseClient, _provider: string): Promise<DbAiProvider[]> => []), // Default: empty DB
    log: spy(() => {}), // Default: no-op spy
    error: spy(() => {}), // Default: no-op spy
    ...overrides,
});

// --- Test Suite ---

Deno.test("syncOpenAIModels", { 
    sanitizeOps: false, // Allow async ops
    sanitizeResources: false, // Allow network/file ops (supabase mock might still need this)
}, async (t) => {

    // --- Test Cases ---

    // UNCOMMENTING this test case
    await t.step("should insert new models when DB is empty and API returns models", async () => {
        const mockApiKey = "test-api-key";
        // let fetchStubDisposable: Disposable | undefined; // No longer needed
        try {
            // Mock the API response via deps
            const mockApiModelsData: ProviderModelInfo[] = [
                // Use the adapter's expected output structure
                { api_identifier: "openai-gpt-4", name: "OpenAI gpt-4", description: undefined }, // Use undefined for null description
                { api_identifier: "openai-gpt-3.5-turbo", name: "OpenAI gpt-3.5-turbo", description: undefined }
            ];
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModelsData), // Mock API return
                getCurrentDbModels: spy(async () => []), // Mock empty DB return
            });

            // Configure the Supabase mock for the expected INSERT operation
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        // select is handled by mockDeps.getCurrentDbModels
                        // We expect an insert, provide a mock success response for it
                        insert: { data: mockApiModelsData.map(m => ({ ...m, id: crypto.randomUUID(), is_active: true, provider: 'openai' })), error: null, count: 2 } // Ensure provider is added for mock data
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            // Call the function with mock deps
            const result = await syncOpenAIModels(mockClient as any, mockApiKey, mockDeps);
            
            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [mockApiKey] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, 'openai'] });
            
            // Check Supabase INSERT interactions via spies
            const fromSpy = spies.fromSpy;
            // Should only be called ONCE now (for the insert)
            assertEquals(fromSpy.calls.length, 1, "from('ai_providers') should be called once (for insert)"); 

            // Check insert on the spies returned by the first from() call
            const insertBuilderSpies = fromSpy.calls[0].returned;
            assertExists(insertBuilderSpies.insert, "Insert spy should exist on builder");
            assertEquals(insertBuilderSpies.insert.calls.length, 1, "insert should be called once"); // Check count on correct builder
            
            // Check the arguments passed to insert 
            const insertArgs = insertBuilderSpies.insert.calls[0].args[0] as any[]; // Cast for easier access
            assertEquals(insertArgs.length, 2); // Inserted 2 models
            assertEquals(insertArgs[0].api_identifier, "openai-gpt-4");
            assertEquals(insertArgs[0].name, "OpenAI gpt-4"); 
            assertEquals(insertArgs[0].provider, "openai");
            assertEquals(insertArgs[1].api_identifier, "openai-gpt-3.5-turbo");
            assertEquals(insertArgs[1].name, "OpenAI gpt-3.5-turbo"); 
            assertEquals(insertArgs[1].provider, "openai");

            // Check the SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 2);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            // No cleanup needed for fetch stub
        }
    });

    // UNCOMMENTING this test case - Updated for DI
    await t.step("should return error result if listProviderModels fails", async () => {
        const mockApiKey = "test-api-key";
        const apiError = new Error("API Auth Error");
        // let fetchStubDisposable: Disposable | undefined; // No longer needed
         try {
            // Mock listProviderModels to reject via deps
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(() => Promise.reject(apiError)),
            });

            // No specific DB config needed as it shouldn't be called
            const { client: mockClient, spies } = createMockSupabaseClient();

            // Call the function with mock deps
            const result = await syncOpenAIModels(mockClient as any, mockApiKey, mockDeps);

            // Assert listProviderModels was called
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [mockApiKey] });
            // Ensure getCurrentDbModels was NOT called
            assertSpyCalls(mockDeps.getCurrentDbModels as Spy, 0);
            // Error should have been logged by the catch block
            assertSpyCall(mockDeps.error as Spy, 0);
            assert((mockDeps.error as Spy).calls[0].args[1] === apiError); 
            
            // Ensure Supabase was NOT called
            assertEquals(spies.fromSpy.calls.length, 0);

            // Check the SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            // The outer catch block should catch the error from listProviderModels
            assertEquals(result.error, apiError.message); 
        } finally {
             // No cleanup needed
        }
    });
    
    // --- KEEP THIS TEST ACTIVE --- - Updated for DI 
    await t.step("should return error result if getCurrentDbModels fails", async () => {
        const mockApiKey = "test-api-key";
        const dbSelectError = new Error("DB Connection refused"); 
        // let fetchStubDisposable: Disposable | undefined; // No longer needed
        // let caughtError: any = null; // Not needed with assertRejects
        try {
             // Mock successful API call via deps
             const mockApiModelsData: ProviderModelInfo[] = [
                 // Use undefined for description instead of null
                 { api_identifier: "openai-gpt-4", name: "OpenAI gpt-4", description: undefined } 
             ];
             // Mock getCurrentDbModels to reject via deps
             const mockDeps = createMockSyncDeps({
                 listProviderModels: spy(async () => mockApiModelsData),
                 getCurrentDbModels: spy(() => Promise.reject(dbSelectError))
             });

            // No specific DB config needed as mutations shouldn't be called
            const { client: mockClient, spies } = createMockSupabaseClient();

            // Call the function - it should catch the rejection from getCurrentDbModels
            const result = await syncOpenAIModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [mockApiKey] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, 'openai'] });
            assertSpyCall(mockDeps.error as Spy, 0); // Check that error was logged
            assert( (mockDeps.error as Spy).calls[0].args[1] === dbSelectError); // Check the logged error object

            // Ensure Supabase mutation functions were NOT called
            assertEquals(spies.fromSpy.calls.length, 0); // from() shouldn't be called directly by syncOpenAIModels anymore

            // Check the SyncResult - error should be caught and returned
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, dbSelectError.message); 

        } finally {
            // No cleanup needed
        }
    });

    // --- ISOLATED TEST FOR getCurrentDbModels --- 
    // This test remains valid as it tests the actual getCurrentDbModels function 
    // imported from index.ts, not the one mocked in SyncOpenAIDeps for the main tests.
    // Need to import the actual function for this isolated test.
    const { getCurrentDbModels: actualGetCurrentDbModelsForTest } = await import("./index.ts");
    
    await t.step("ISOLATED_getCurrentDbModels should throw when select fails", async () => {
        const providerName = 'test_provider'; 
        const dbError = { message: "Isolated select failed", code: "500", details: "", hint: "" };
        
        // Configure mock client for select error
        const mockSupabaseConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                ai_providers: {
                    select: { data: null, error: dbError }
                }
            }
        };
        const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

        // Call the *actual* getCurrentDbModels directly using assertRejects
        await assertRejects(
            async () => {
                 await actualGetCurrentDbModelsForTest(mockClient as any, providerName);
            },
            Error, // Expect an Error object
            // Check the specific error message thrown by getCurrentDbModels
            `Database error fetching models for ${providerName}: ${dbError.message}`
        );

        // Verify the underlying select and eq calls were made
        assertSpyCall(spies.fromSpy, 0, { args: ['ai_providers'] });
        const queryBuilderSpies = spies.fromSpy.calls[0].returned;
        assertSpyCall(queryBuilderSpies.select, 0);
        assertSpyCall(queryBuilderSpies.eq, 0, { args: ['provider', providerName] }); 
    });
    // --- END ISOLATED TEST ---


    // --- Add More Test Cases Here (Update, Deactivate, Mix, DB Insert/Update Errors) ---
    
    // UNCOMMENTING update/deactivate test - Updated for DI
    await t.step("should update existing models and deactivate missing ones", async () => {
        const mockApiKey = "test-api-key";
        // let fetchStubDisposable: Disposable | undefined; // No longer needed
        try {
             // API returns gpt-4 (updated) and gpt-new, but NOT gpt-old
            const mockApiModelsData: ProviderModelInfo[] = [
                { api_identifier: "openai-gpt-4", name: "OpenAI gpt-4 v2", description: "Updated desc" }, // Changed name/desc
                { api_identifier: "openai-gpt-new", name: "OpenAI gpt-new", description: undefined }, // Use undefined instead of null
            ]; 

            // DB contains gpt-4 (old version) and gpt-old
            const existingDbModels: DbAiProvider[] = [
                 { id: 'db-id-1', api_identifier: 'openai-gpt-4', name: 'OpenAI gpt-4', description: null, is_active: true, provider: 'openai' }, 
                 { id: 'db-id-2', api_identifier: 'openai-gpt-old', name: 'OpenAI gpt-old', description: null, is_active: true, provider: 'openai' },
            ]; 
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModelsData),
                getCurrentDbModels: spy(async () => existingDbModels),
            });

            // Configure Supabase mock for expected UPDATE (for gpt-4), INSERT (for gpt-new) and UPDATE (for deactivate gpt-old)
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        // Mock the UPDATE for gpt-4 (db-id-1) - Simplified data for syntax fix
                        // Needs to handle multiple operations. The mock client might need adjustment if 
                        // it returns the same result for all updates/inserts regardless of filters/data.
                        // For now, provide a generic success for update/insert.
                        update: { data: [{ id: 'mock-updated-id' }], error: null, count: 1 }, 
                        insert: { data: [{ id: 'mock-inserted-id' }], error: null, count: 1 },
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            // Call the function with mock deps
            const result = await syncOpenAIModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [mockApiKey] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, 'openai'] });

            // Check Supabase operations
            const fromSpy = spies.fromSpy;
            // Expect from() calls for: INSERT (gpt-new), UPDATE (gpt-4), UPDATE (deactivate gpt-old)
            assertEquals(fromSpy.calls.length, 3, "from('ai_providers') should be called 3 times (insert, update, deactivate)"); 
            
            // NOTE: The order of insert/update/deactivate calls isn't strictly guaranteed
            // unless the code enforces it. We check that *each* expected operation happened.
            
            // Find the INSERT call (for gpt-new)
            const insertCall = fromSpy.calls.find(call => call.returned.insert?.calls.length > 0);
            assertExists(insertCall, "Expected an insert call");
            assertSpyCall(insertCall.returned.insert, 0); // Called once
            assertEquals(insertCall.returned.insert.calls[0].args[0][0].api_identifier, 'openai-gpt-new');

            // Find the UPDATE call for gpt-4 (id: db-id-1)
            const updateCall = fromSpy.calls.find(call => 
                call.returned.update?.calls.length > 0 && 
                call.returned.eq?.calls.some((eqCall: any) => eqCall.args[0] === 'id' && eqCall.args[1] === 'db-id-1')
            );
            assertExists(updateCall, "Expected an update call for db-id-1");
            assertSpyCall(updateCall.returned.update, 0); // Called once
            assertEquals(updateCall.returned.update.calls[0].args[0].name, 'OpenAI gpt-4 v2');
            assertEquals(updateCall.returned.update.calls[0].args[0].description, 'Updated desc');
            assertSpyCall(updateCall.returned.eq, 0, { args: ['id', 'db-id-1'] });

            // Find the UPDATE call for deactivation (for gpt-old, id: db-id-2)
             const deactivateCall = fromSpy.calls.find(call => 
                call.returned.update?.calls.length > 0 && 
                call.returned.in?.calls.some((inCall: any) => inCall.args[0] === 'id' && inCall.args[1]?.includes('db-id-2')) &&
                call.returned.update?.calls[0].args[0].is_active === false
            );
            assertExists(deactivateCall, "Expected a deactivate update call for db-id-2");
            assertSpyCall(deactivateCall.returned.update, 0); // Called once
            assertEquals(deactivateCall.returned.update.calls[0].args[0].is_active, false);
            assertSpyCall(deactivateCall.returned.in, 0, { args: ['id', ['db-id-2']] });

            // Check the SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 1);
            assertEquals(result.updated, 1);
            assertEquals(result.deactivated, 1);
            assertEquals(result.error, undefined);

        } finally {
             // No cleanup needed
        }
    });
    

    // UNCOMMENTING DB Insert Error test
    await t.step("should return error result if DB insert fails", async () => {
        const mockApiKey = "test-api-key";
        const dbInsertError = { message: "Insert constraint violation", code: "23505" };

        try {
            // Mock API returns one new model
            const mockApiModelsData: ProviderModelInfo[] = [
                { api_identifier: "openai-gpt-new", name: "OpenAI gpt-new", description: undefined } // Use undefined
            ];
            // Mock DB is empty
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModelsData),
                getCurrentDbModels: spy(async () => []),
            });

            // Configure Supabase mock for INSERT failure
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        insert: { data: null, error: dbInsertError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            // Call the function - expect error to be caught and returned in result
            const result = await syncOpenAIModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0);
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0);
            assertSpyCall(mockDeps.error as Spy, 0); // Error should be logged from the failed insert
            
            // Check the logged error object and message - Should log the raw error object
            const loggedErrorArg = (mockDeps.error as Spy).calls[0].args[1];
            // assert(loggedErrorArg instanceof Error, "Logged error should be an Error instance"); // Incorrect: Logs the raw error obj
            assertEquals(loggedErrorArg, dbInsertError, "Logged error object mismatch"); // Check if the logged object matches the mock error
            // assertEquals(loggedErrorArg.message, `Insert failed for openai: ${dbInsertError.message}`, "Logged error message mismatch");

            // Check Supabase insert attempt
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1);
            const insertBuilderSpies = fromSpy.calls[0].returned;
            assertSpyCall(insertBuilderSpies.insert, 0); 

            // Check the SyncResult
            assertEquals(result.provider, "openai");
            assertEquals(result.inserted, 0); // Failed
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, `Insert failed for openai: ${dbInsertError.message}`);

        } finally { }
    });

    // --- NEW TEST: No Change Scenario ---
    await t.step("should do nothing if API and DB models match", async () => {
        const mockApiKey = "test-api-key";
        try {
            // Define a common model structure that exists in both API and DB
            const commonApiModel: ProviderModelInfo = { 
                api_identifier: "openai-gpt-4", 
                name: "OpenAI gpt-4", 
                description: "Test description" 
            };
            const commonDbModel: DbAiProvider = {
                id: 'db-id-1',
                api_identifier: commonApiModel.api_identifier,
                name: commonApiModel.name,
                description: commonApiModel.description ?? null,
                is_active: true, // Ensure it's active
                provider: 'openai'
            };
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [commonApiModel]), // API returns the model
                getCurrentDbModels: spy(async () => [commonDbModel]), // DB returns the exact same model (active)
            });

            // Configure Supabase mock (no DB ops expected)
            const { client: mockClient, spies } = createMockSupabaseClient();
            
            // Call function with mock deps
            const result = await syncOpenAIModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [mockApiKey] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, 'openai'] });

            // No Supabase calls expected
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 0, "No Supabase calls should happen");
            
            // Check SyncResult
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            // No cleanup needed
        }
    });

    // --- NEW TEST: Reactivation Scenario ---
    await t.step("should reactivate inactive model if it reappears in API", async () => {
        const mockApiKey = "test-api-key";
        const modelId = 'db-reactivate-id';
        try {
            // Define the model that appears in the API
            const apiModel: ProviderModelInfo = { 
                api_identifier: "openai-gpt-reactivate", 
                name: "OpenAI Reactivate", 
                description: "Should be reactivated" 
            };
            // Define the same model as existing in the DB but inactive
            const existingInactiveDbModel: DbAiProvider = {
                id: modelId,
                api_identifier: apiModel.api_identifier,
                name: apiModel.name, // Assume name/desc might also be updated
                description: "Old description", // Simulate description update too
                is_active: false, // Key part: it's inactive
                provider: 'openai'
            };
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [apiModel]), // API returns the model
                getCurrentDbModels: spy(async () => [existingInactiveDbModel]), // DB has it, but inactive
            });

            // Configure Supabase mock for the expected UPDATE operation
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        update: { data: [{ id: modelId, is_active: true }], error: null, count: 1 } // Expect successful update
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            // Call function with mock deps
            const result = await syncOpenAIModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [mockApiKey] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, 'openai'] });

            // Check Supabase UPDATE call
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1, "Only one Supabase call (update) should happen");
            
            const updateCall = fromSpy.calls[0];
            assertExists(updateCall.returned.update, "Update spy should exist");
            assertSpyCall(updateCall.returned.update, 0); // Update called once
            
            // Check the payload sent to update
            const updatePayload = updateCall.returned.update.calls[0].args[0];
            assertEquals(updatePayload.is_active, true, "is_active should be set to true");
            assertEquals(updatePayload.description, apiModel.description, "Description should be updated"); 

            // Check that the correct model ID was targeted
            assertExists(updateCall.returned.eq, "eq spy should exist");
            assertSpyCall(updateCall.returned.eq, 0, { args: ['id', modelId] });
            
            // Check SyncResult
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 1); // Reactivation counts as an update
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            // No cleanup needed
        }
    });

    // --- NEW TEST: Deactivate All Scenario ---
    await t.step("should deactivate all active models if API returns empty", async () => {
        const mockApiKey = "test-api-key";
        try {
            // Mock API returns empty list
            const apiModels: ProviderModelInfo[] = []; 

            // Mock DB returns active and inactive models
            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-active1', api_identifier: 'openai-active1', name: 'Active 1', description: null, is_active: true, provider: 'openai' },
                { id: 'db-id-active2', api_identifier: 'openai-active2', name: 'Active 2', description: null, is_active: true, provider: 'openai' },
                { id: 'db-id-inactive', api_identifier: 'openai-inactive', name: 'Inactive', description: null, is_active: false, provider: 'openai' },
            ];
            const activeModelIds = ['db-id-active1', 'db-id-active2'];
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => apiModels), // API is empty
                getCurrentDbModels: spy(async () => existingDbModels), // DB has models
            });

            // Configure Supabase mock for the expected DEACTIVATE update operation
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        // Expect successful deactivation update call
                        update: { data: activeModelIds.map(id => ({ id, is_active: false })), error: null, count: activeModelIds.length } 
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            // Call function with mock deps
            const result = await syncOpenAIModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [mockApiKey] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, 'openai'] });

            // Check Supabase DEACTIVATE update call
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1, "Only one Supabase call (deactivate update) should happen");
            
            const deactivateCall = fromSpy.calls[0];
            assertExists(deactivateCall.returned.update, "Update spy should exist");
            assertSpyCall(deactivateCall.returned.update, 0, { args: [{ is_active: false }] }); // Check the payload
            
            // Check that the .in() filter targeted the correct IDs
            assertExists(deactivateCall.returned.in, "in spy should exist");
            assertSpyCall(deactivateCall.returned.in, 0);
            const inArgs = deactivateCall.returned.in.calls[0].args;
            assertEquals(inArgs[0], 'id');
            // Use assertArrayIncludes or similar for set comparison if order isn't guaranteed
            assertEquals(inArgs[1]?.length, activeModelIds.length, "Should target only initially active models");
            assert(inArgs[1]?.includes('db-id-active1'));
            assert(inArgs[1]?.includes('db-id-active2'));
            
            // Check SyncResult
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, activeModelIds.length); // Only the initially active models
            assertEquals(result.error, undefined);
        } finally {
            // No cleanup needed
        }
    });

    // --- NEW TEST: DB Update Failure ---
    await t.step("should return error result if DB update fails", async () => {
        const mockApiKey = "test-api-key";
        const modelIdToUpdate = 'db-update-fail-id';
        const dbUpdateError = { message: "Update conflict error", code: "23503" }; // Example error

        try {
            // API model requires an update (e.g., new description)
            const apiModel: ProviderModelInfo = { 
                api_identifier: "openai-update-fail", 
                name: "Update Fail Model", 
                description: "New description causing update" 
            };
            // Existing DB model (active)
            const existingDbModel: DbAiProvider = {
                id: modelIdToUpdate,
                api_identifier: apiModel.api_identifier,
                name: apiModel.name,
                description: "Old description",
                is_active: true, 
                provider: 'openai'
            };
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [apiModel]),
                getCurrentDbModels: spy(async () => [existingDbModel]),
            });

            // Configure Supabase mock for UPDATE failure
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        update: { data: null, error: dbUpdateError } // Simulate update failure
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            // Call function - expect error to be caught and returned in result
            const result = await syncOpenAIModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0);
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0);
            
            // Check Supabase update attempt
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1, "Only one Supabase call (update attempt) should happen");
            const updateCall = fromSpy.calls[0];
            assertExists(updateCall.returned.update, "Update spy should exist");
            assertSpyCall(updateCall.returned.update, 0); // Update called once
            assertExists(updateCall.returned.eq, "eq spy should exist");
            assertSpyCall(updateCall.returned.eq, 0, { args: ['id', modelIdToUpdate] }); // Correct model targeted

            // Check that the error was logged by the outer catch block
            assertSpyCall(mockDeps.error as Spy, 0); 
            const loggedErrorArg = (mockDeps.error as Spy).calls[0].args[1];
            // assert(loggedErrorArg instanceof Error, "Logged error should be an Error instance"); // Incorrect: Logs the raw error obj
            assertEquals(loggedErrorArg, dbUpdateError, "Logged error object should match the mock DB error"); // Check the raw object
            // Check the error message contained within the result, which *is* formatted
            // assertEquals(loggedErrorArg.message, `Update failed for model ID ${modelIdToUpdate} (openai): ${dbUpdateError.message}`); // This would fail as loggedErrorArg is not Error
            
            // Check SyncResult
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0); // Update failed
            assertEquals(result.deactivated, 0);
            // Check the error message formatted by the *outer* catch block
            assertEquals(result.error, `Update failed for model ID ${modelIdToUpdate} (openai): ${dbUpdateError.message}`);

        } finally { }
    });

    // --- NEW TEST: DB Deactivate Failure ---
    await t.step("should return error result if DB deactivate fails", async () => {
        const mockApiKey = "test-api-key";
        const activeModelIds = ['db-deactivate-fail1', 'db-deactivate-fail2'];
        const dbDeactivateError = { message: "Deactivation constraint violation", code: "23504" }; // Example error

        try {
            // Mock API returns empty list
            const apiModels: ProviderModelInfo[] = []; 

            // Mock DB returns active models that need deactivation
            const existingDbModels: DbAiProvider[] = [
                { id: activeModelIds[0], api_identifier: 'openai-deactivate-fail1', name: 'Deactivate Fail 1', description: null, is_active: true, provider: 'openai' },
                { id: activeModelIds[1], api_identifier: 'openai-deactivate-fail2', name: 'Deactivate Fail 2', description: null, is_active: true, provider: 'openai' },
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
            const result = await syncOpenAIModels(mockClient as any, mockApiKey, mockDeps);

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
            // assert(loggedErrorArg instanceof Error, "Logged error should be an Error instance"); // Incorrect: Logs the raw error obj
            assertEquals(loggedErrorArg, dbDeactivateError, "Logged error object should match the mock DB error"); // Check the raw object
            // Check the error message contained within the result, which *is* formatted
            // assertEquals(loggedErrorArg.message, `Deactivation failed for openai: ${dbDeactivateError.message}`); // This would fail as loggedErrorArg is not Error
            
            // Check SyncResult
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0); 
            assertEquals(result.deactivated, 0); // Deactivation failed
            // Check the error message formatted by the *outer* catch block
            assertEquals(result.error, `Deactivation failed for openai: ${dbDeactivateError.message}`);

        } finally { }
    });

}); // End Deno.test suite

// --- NEW ISOLATED TEST FOR MOCK CLIENT RESOLUTION WITH ERROR ---
Deno.test("MockClientResolutionWithError", async (t) => {
    await t.step("mock client .then() should resolve with error object when configured", async () => {
        const dbError = { message: "Mock client resolves with this error", code: "MOCK" };
        
        // Configure mock client for select error
        const mockSupabaseConfig: MockSupabaseDataConfig = {
            genericMockResults: {
                ai_providers: {
                    select: { data: null, error: dbError }
                }
            }
        };
        const { client: mockClient } = createMockSupabaseClient(mockSupabaseConfig);

        // Directly await the query builder chain.
        // We expect it to RESOLVE now, not reject.
        try {
            console.log("[Test Log] Before awaiting mock client call...");
            const result = await mockClient.from('ai_providers').select(); // Use .select() to be more explicit
            console.log("[Test Log] After awaiting mock client call. Result:", result);
            
            // Assert that the resolved result contains the error object
            assertExists(result.error, "Expected result.error to exist");
            assertEquals(result.error.message, dbError.message);
            assertEquals(result.error.code, dbError.code);
            assertEquals(result.data, null);

        } catch (e) {
            // If it rejects unexpectedly, fail the test using throw
            throw new Error(`Mock client rejected unexpectedly: ${e}`);
        }
    });
});
// --- END ISOLATED TEST --- 