// Import test utilities and types
import { assertSpyCall, assertSpyCalls, spy, stub, type Stub, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Import the function to test AND the dependency interface
import { syncGoogleModels, type SyncGoogleDeps } from "./google_sync.ts"; 

// Import shared types and test utils
// NOTE: getCurrentDbModels is now mocked via deps, but keep types
import type { DbAiProvider, SyncResult } from "./index.ts"; 
// Corrected path for ProviderModelInfo
import type { ProviderModelInfo } from "../_shared/types.ts";
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    type MockQueryBuilderState 
} from "../_shared/supabase.mock.ts";
// REMOVE these lines:
// import { GoogleAIHandler } from "./google_sync.ts"; // Handler we are testing
// import type { GoogleModel } from "./google_models.ts"; // Type for models
// import type { ApiModel } from "../_shared/models.ts"; // Type for database model
// import type { 
//     AdapterRequestPayload, 
//     AdapterResponsePayload, 
//     TextContent, 
//     ModelParams,
//     ModelProviderOptions,
//     PromptChoice,
//     ResponseMessage
// } from "../../_shared/ai_service/types.ts"; 

// Constants for Google
const PROVIDER_NAME = 'google';
const GOOGLE_API_KEY = "test-google-key"; // Use a placeholder key for tests

// Helper to create mock dependencies (similar to OpenAI test)
const createMockSyncDeps = (overrides: Partial<SyncGoogleDeps> = {}): SyncGoogleDeps => ({
    listProviderModels: spy(async (_apiKey: string): Promise<ProviderModelInfo[]> => []), // Default: empty models
    getCurrentDbModels: spy(async (_client: SupabaseClient, _provider: string): Promise<DbAiProvider[]> => []), // Default: empty DB
    log: spy(() => {}), // Default: no-op spy
    error: spy(() => {}), // Default: no-op spy
    ...overrides,
});

// --- Test Suite ---

Deno.test("syncGoogleModels", { 
    sanitizeOps: false, 
    sanitizeResources: false, 
}, async (t) => {

    await t.step("should insert new models when DB is empty and adapter returns models", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        try {
            // Mock the API response via deps
            const mockApiModels: ProviderModelInfo[] = [
                { api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro', description: 'Most capable model' },
                { api_identifier: 'google-gemini-1.5-flash-latest', name: 'Google Gemini 1.5 Flash', description: 'Fast and versatile model' },
            ];
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels), // Mock API return
                getCurrentDbModels: spy(async () => []), // Mock empty DB return
            });
            
            // Configure the Supabase mock for INSERT
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        // select handled by mockDeps.getCurrentDbModels
                        insert: { data: mockApiModels.map(m => ({ ...m, provider: PROVIDER_NAME, is_active: true, id: crypto.randomUUID() })), error: null, count: mockApiModels.length }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);

            // Call the function with mock deps
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY, mockDeps);
            
            // Assertions 
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [GOOGLE_API_KEY] }); 
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
            // listModelsStub?.restore(); // No stub to restore
        }
    });

    await t.step("should return error result if listProviderModels fails", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        const adapterError = new Error("Google API Key Invalid");
        try {
            // Mock listProviderModels to reject via deps
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(() => Promise.reject(adapterError))
            });
            
            const { client: mockClient, spies } = createMockSupabaseClient();

            // Call the function with mock deps
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY, mockDeps);
            
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [GOOGLE_API_KEY] });
            assertSpyCalls(mockDeps.getCurrentDbModels as Spy, 0); // Should not be called
            assertSpyCall(mockDeps.error as Spy, 0); // Error should be logged
            assert((mockDeps.error as Spy).calls[0].args[1] === adapterError); // Check logged error object

            // Ensure Supabase was NOT called
            assertEquals(spies.fromSpy.calls.length, 0);

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, adapterError.message); 

        } finally {
            // listModelsStub?.restore(); // No stub to restore
        }
    });
    
    await t.step("should return error result if getCurrentDbModels fails", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        const dbSelectError = new Error("DB Connection refused");
        try {
            // Mock adapter to return successfully via deps
             const mockApiModels: ProviderModelInfo[] = [
                { api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro', description: 'Most capable model' },
             ];
            // Mock getCurrentDbModels to reject via deps
             const mockDeps = createMockSyncDeps({
                 listProviderModels: spy(async () => mockApiModels),
                 getCurrentDbModels: spy(() => Promise.reject(dbSelectError))
             });

            // Configure Supabase mock (no DB ops expected)
            const { client: mockClient, spies } = createMockSupabaseClient();

            // Call the function with mock deps
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY, mockDeps);

            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [GOOGLE_API_KEY] });
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
            // The error message comes from the rejected promise caught in the main function
            assertEquals(result.error, dbSelectError.message);

        } finally {
            // listModelsStub?.restore(); // No stub to restore
        }
    });

    await t.step("should do nothing if API and DB models match", async () => {
        const mockApiKey = "test-google-key";
        try {
            // Define a common model structure that exists in both API and DB
            const commonApiModel: ProviderModelInfo = {
                api_identifier: "google-gemini-1.0-pro",
                name: "Google Gemini 1.0 Pro",
                description: "Balanced model"
            };
            const commonDbModel: DbAiProvider = {
                id: 'db-google-1',
                api_identifier: commonApiModel.api_identifier,
                name: commonApiModel.name,
                description: commonApiModel.description ?? null,
                is_active: true, // Ensure it's active
                provider: 'google' // Correct provider
            };

            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [commonApiModel]), // API returns the model
                getCurrentDbModels: spy(async () => [commonDbModel]), // DB returns the exact same model (active)
            });

            // Configure Supabase mock (no DB ops expected)
            const { client: mockClient, spies } = createMockSupabaseClient();

            // Call function with mock deps
            const result = await syncGoogleModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [mockApiKey] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, 'google'] });

            // No Supabase calls expected
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 0, "No Supabase calls should happen");

            // Check SyncResult
            assertEquals(result.provider, 'google');
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally { }
    });

    await t.step("should return error result if DB insert fails", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        const dbError = { message: "Insert failed", code: "23505" };
        try {
            const mockApiModels = [{ api_identifier: 'google-new-model', name: 'Google New Model', description: undefined }];
            
            // Mock dependencies
             const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels),
                getCurrentDbModels: spy(async () => []) // DB is empty
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
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY, mockDeps);

            assertSpyCall(mockDeps.listProviderModels as Spy, 0);
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0);
            assertSpyCall(mockDeps.error as Spy, 0); // Log the DB error
            assert((mockDeps.error as Spy).calls[0].args[0] === `Insert resolved with error object for ${PROVIDER_NAME}:`);
            assert((mockDeps.error as Spy).calls[0].args[1] === dbError, "The original dbError object should be logged");

            // Check Supabase insert attempt
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1); // Only insert attempt
            assertSpyCall(fromSpy.calls[0].returned.insert, 0);

            // Check SyncResult
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, `Insert failed for ${PROVIDER_NAME}: Insert failed for ${PROVIDER_NAME}: ${dbError.message}`); 
        } finally {
            // listModelsStub?.restore(); // No stub to restore
        }
    });

     await t.step("should return error result if DB update fails", async () => {
        // let listModelsStub: Stub | undefined; // No longer needed
        const dbError = { message: "Update failed", code: "xxxxx" };
        const modelId = 'db-id-g1';
        try {
            const mockApiModels = [{ api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro UPDATED', description: undefined }];
            const existingDbModels: DbAiProvider[] = [
                { id: modelId, api_identifier: 'google-gemini-1.5-pro-latest', name: 'Google Gemini 1.5 Pro', description: null, is_active: true, provider: PROVIDER_NAME },
            ];

            // Mock dependencies
             const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels),
                getCurrentDbModels: spy(async () => existingDbModels) 
            });

            // Configure Supabase mock for UPDATE failure
            // The mock client might need adjustment if it doesn't handle multiple update calls well
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                 genericMockResults: {
                    ai_providers: {
                        select: { data: existingDbModels, error: null, count: 1 },
                        // Simulate update failure
                        update: { data: null, error: dbError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY, mockDeps);

            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [GOOGLE_API_KEY] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, PROVIDER_NAME] });
            assertSpyCall(mockDeps.error as Spy, 0); // Error should be logged
            assert((mockDeps.error as Spy).calls[0].args[0] === `Update resolved with error object for model ID ${modelId} (${PROVIDER_NAME}):`);
            assert((mockDeps.error as Spy).calls[0].args[1] === dbError, "The original dbError object should be logged");

            const fromSpy = spies.fromSpy;
            // Check that Supabase .from() was called exactly once for the update attempt
            assertEquals(fromSpy.calls.length, 1, "from() should be called once for the update attempt");
            // Check the details of the first (and only) call
            assertSpyCall(fromSpy.calls[0].returned.update, 0);
            assertSpyCall(fromSpy.calls[0].returned.eq, 0, { args: ['id', modelId] });

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0); // Update failed
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, `Update process failed for ${PROVIDER_NAME}: Update failed for model ID ${modelId} (${PROVIDER_NAME}): ${dbError.message}`); 
        } finally {
            // listModelsStub?.restore(); // No stub to restore
        }
    });
    
    await t.step("should return error result if DB deactivate fails", async () => {
        const dbError = { message: "Deactivation failed", code: "xxxxx" };
        try {
            // API returns empty list, triggering deactivation
            const mockApiModels: ProviderModelInfo[] = [];

            // DB has active models to deactivate
            const existingDbModels: DbAiProvider[] = [
                { id: 'db-google-deact1', api_identifier: 'google-old1', name: 'Old 1', description: null, is_active: true, provider: PROVIDER_NAME },
                { id: 'db-google-deact2', api_identifier: 'google-old2', name: 'Old 2', description: null, is_active: true, provider: PROVIDER_NAME },
            ];
            const idsToDeactivate = existingDbModels.map(m => m.id);

            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels), // API is empty
                getCurrentDbModels: spy(async () => existingDbModels) // DB has models to deactivate
            });

            // Configure Supabase mock for DEACTIVATE update failure
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        // Simulate update (deactivate) failure
                        update: { data: null, error: dbError } 
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(mockSupabaseConfig);
            
            // Call function
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [GOOGLE_API_KEY] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, PROVIDER_NAME] });
            assertSpyCall(mockDeps.error as Spy, 0); // Error should be logged
            assert((mockDeps.error as Spy).calls[0].args[0] === `Deactivation resolved with error object for ${PROVIDER_NAME}:`);
            assert((mockDeps.error as Spy).calls[0].args[1] === dbError, "The original dbError object should be logged");

            // Check Supabase DEACTIVATE update attempt
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1, "Only one Supabase call (deactivate update) should happen");
            
            const deactivateCall = fromSpy.calls[0];
            assertExists(deactivateCall.returned.update, "Update spy should exist");
            assertSpyCall(deactivateCall.returned.update, 0, { args: [{ is_active: false }] }); // Check payload
            
            // Check that the .in() filter targeted the correct IDs
            assertExists(deactivateCall.returned.in, "in spy should exist");
            assertSpyCall(deactivateCall.returned.in, 0);
            const inArgs = deactivateCall.returned.in.calls[0].args;
            assertEquals(inArgs[0], 'id');
            assertEquals(inArgs[1], idsToDeactivate, "Should target correct IDs for deactivation");
            
            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0); // Deactivation failed
            assertEquals(result.error, `Deactivation failed for ${PROVIDER_NAME}: Deactivation failed for ${PROVIDER_NAME}: ${dbError.message}`); 
        } finally { }
    });

    await t.step("should reactivate inactive model if it reappears in API", async () => {
        const mockApiKey = "test-google-key";
        const modelId = 'db-google-reactivate';
        try {
            // Define the model that appears in the API
            const apiModel: ProviderModelInfo = { 
                api_identifier: "google-reactivate-model", 
                name: "Google Reactivate", 
                description: "Should be reactivated"
            };
            // Define the same model as existing in the DB but inactive
            const existingInactiveDbModel: DbAiProvider = {
                id: modelId,
                api_identifier: apiModel.api_identifier,
                name: "Google Reactivate Old Name", // Simulate name/desc update too
                description: "Old description",
                is_active: false, // Key part: it's inactive
                provider: 'google'
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
            const result = await syncGoogleModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [mockApiKey] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, 'google'] });

            // Check Supabase UPDATE call
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1, "Only one Supabase call (update) should happen");
            
            const updateCall = fromSpy.calls[0];
            assertExists(updateCall.returned.update, "Update spy should exist");
            assertSpyCall(updateCall.returned.update, 0); // Update called once
            
            // Check the payload sent to update
            const updatePayload = updateCall.returned.update.calls[0].args[0];
            assertEquals(updatePayload.name, apiModel.name, "Name should be updated");
            assertEquals(updatePayload.description, apiModel.description, "Description should be updated"); 
            assertEquals(updatePayload.is_active, true, "is_active should be set to true");

            // Check that the correct model ID was targeted
            assertExists(updateCall.returned.eq, "eq spy should exist");
            assertSpyCall(updateCall.returned.eq, 0, { args: ['id', modelId] });
            
            // Check SyncResult
            assertEquals(result.provider, 'google');
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 1); // Reactivation counts as an update
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally { }
    });

    // --- NEW TEST: Deactivate All Scenario ---
    await t.step("should deactivate all active models if API returns empty", async () => {
        const mockApiKey = "test-google-key";
        try {
            // Mock API returns empty list
            const apiModels: ProviderModelInfo[] = []; 

            // Mock DB returns active and inactive models
            const existingDbModels: DbAiProvider[] = [
                { id: 'db-google-active1', api_identifier: 'google-active1', name: 'Active 1', description: null, is_active: true, provider: 'google' },
                { id: 'db-google-active2', api_identifier: 'google-active2', name: 'Active 2', description: null, is_active: true, provider: 'google' },
                { id: 'db-google-inactive', api_identifier: 'google-inactive', name: 'Inactive', description: null, is_active: false, provider: 'google' },
            ];
            const activeModelIds = ['db-google-active1', 'db-google-active2'];
            
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
            const result = await syncGoogleModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [mockApiKey] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, 'google'] });

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
            assertEquals(inArgs[1]?.length, activeModelIds.length, "Should target only initially active models");
            assert(inArgs[1]?.includes('db-google-active1'));
            assert(inArgs[1]?.includes('db-google-active2'));
            
            // Check SyncResult
            assertEquals(result.provider, 'google');
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, activeModelIds.length); // Only the initially active models
            assertEquals(result.error, undefined);
        } finally { }
    });

    // --- Additional Google Specific Tests (Optional) ---
    // Add any tests specific to Google's API behavior or model properties if needed.

}); 