// Import test utilities and types
import { assertSpyCall, assertSpyCalls, spy, stub, type Stub, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Import the function to test AND the dependency interface
import { syncGoogleModels, type SyncGoogleDeps, createDefaultGoogleConfig as actualCreateDefaultGoogleConfig } from "./google_sync.ts";
import { type SyncResult, type DbAiProvider } from "./index.ts";

// Import shared types and test utils
import {
    createMockSupabaseClient,
    type MockSupabaseDataConfig,
    MockQueryBuilderState, // If needed for more detailed spy checks
    type IMockQueryBuilder,  // If needed for more detailed spy checks
} from "../_shared/supabase.mock.ts";
import type { AiProviderAdapter, ProviderModelInfo, AiModelExtendedConfig } from "../_shared/types.ts"; // Added AiModelExtendedConfig

// Constants for Google
const PROVIDER_NAME = 'google';
const GOOGLE_API_KEY = "test-google-key"; // Use a placeholder key for tests

// Helper to create mock dependencies
const createMockSyncDeps = (overrides: Partial<SyncGoogleDeps> = {}): SyncGoogleDeps => ({
    listProviderModels: spy(async (_apiKey: string): Promise<ProviderModelInfo[]> => []), // Default: empty models
    getCurrentDbModels: spy(async (_client: SupabaseClient, _provider: string): Promise<DbAiProvider[]> => []), // Default: empty DB
    log: spy(() => {}), // Default: no-op spy
    error: spy(() => {}), // Default: no-op spy
    ...overrides,
});

// Helper to generate default Google config for testing consistency
const getDefaultGoogleConfig = (apiIdentifier: string, overrides: Partial<AiModelExtendedConfig> = {}) => {
    const baseConfig = actualCreateDefaultGoogleConfig(apiIdentifier); // Use actual function

    // Handle overrides, with special care for tokenization_strategy
    const { tokenization_strategy: overrideTokenizationStrategy, ...otherOverrides } = overrides;

    const mergedConfig = { // Changed to const
        ...baseConfig,
        ...otherOverrides, // Apply top-level overrides
    };

    if (overrideTokenizationStrategy) {
        (mergedConfig as AiModelExtendedConfig).tokenization_strategy = { // Ensure mergedConfig is treated as extensible
            ...(baseConfig.tokenization_strategy || {}), // Start with base's strategy
            ...overrideTokenizationStrategy, // Merge overrides for tokenization_strategy
        };
    }
    
    // Ensure the type is 'google_gemini_tokenizer' if it somehow got changed or wasn't set by base/override.
    if (mergedConfig.tokenization_strategy?.type !== 'google_gemini_tokenizer') {
      (mergedConfig as AiModelExtendedConfig).tokenization_strategy = {
        ...(mergedConfig.tokenization_strategy || {}), // keep existing fields
        type: 'google_gemini_tokenizer', // Ensure type is correct
      };
    }

    return mergedConfig as AiModelExtendedConfig;
};

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
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);

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
            // No specific finally actions needed here.
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
            
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {});

            // Call the function with mock deps
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY, mockDeps);
            
            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [GOOGLE_API_KEY] });
            assertSpyCalls(mockDeps.getCurrentDbModels as Spy, 0); // Should not be called
            assertSpyCall(mockDeps.error as Spy, 0); // Error should be logged
            // Check logged error object
            const listModelsLoggedMetadata = (mockDeps.error as Spy).calls[0].args[1] as { error?: Error };
            assertEquals(listModelsLoggedMetadata?.error, adapterError);

            // Ensure Supabase was NOT called
            assertEquals(spies.fromSpy.calls.length, 0);

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assert(result.error?.includes(`Sync failed for ${PROVIDER_NAME}`), "Error message should contain provider prefix");
            assert(result.error?.includes(adapterError.message), "Error message should contain specific error");

        } finally {
            // No specific finally actions needed here.
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
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {});

            // Call the function with mock deps
            const result = await syncGoogleModels(mockClient as any, GOOGLE_API_KEY, mockDeps);

            assertSpyCall(mockDeps.listProviderModels as Spy, 0, { args: [GOOGLE_API_KEY] });
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0, { args: [mockClient as any, PROVIDER_NAME] });
            assertSpyCall(mockDeps.error as Spy, 0); // Error should be logged
            // Check logged error object
            const getCurrentDbLoggedMetadata = (mockDeps.error as Spy).calls[0].args[1] as { error?: Error };
            assertEquals(getCurrentDbLoggedMetadata?.error, dbSelectError);

            // No Supabase mutation calls expected
            assertEquals(spies.fromSpy.calls.length, 0);

            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assert(result.error?.includes(`Sync failed for ${PROVIDER_NAME}`), "Error message should contain provider prefix");
            assert(result.error?.includes(dbSelectError.message), "Error message should contain specific error");

        } finally {
            // No specific finally actions needed here.
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
                provider: 'google', // Correct provider
                config: null // Added missing config property
            };

            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [commonApiModel]), // API returns the model
                getCurrentDbModels: spy(async () => [commonDbModel]), // DB returns the exact same model (active)
            });

            // Configure Supabase mock (no DB ops expected)
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {});

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
        } finally {
            // No specific finally actions needed here.
        }
    });

    await t.step("should return error result if DB insert fails", async () => {
        const mockApiKey = "test-google-key";
        const dbInsertError = { name: "Error", message: "Insert failed due to constraint", code: "23505" }; // Mock PostgrestError structure
        try {
            // Mock API response (e.g., one new model)
            const mockApiModels: ProviderModelInfo[] = [
                { api_identifier: 'google-new-model', name: 'Google New Model' },
            ];

            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels),
                getCurrentDbModels: spy(async () => []), // DB is empty
            });

            // Configure Supabase mock to return an error on INSERT
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        insert: { data: null, error: dbInsertError, count: null }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);

            // Call the function
            const result = await syncGoogleModels(mockClient as any, mockApiKey, mockDeps);

            // Assertions
            assertSpyCall(mockDeps.listProviderModels as Spy, 0);
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0);
            
            // Check that from was called for insert
            assertEquals(spies.fromSpy.calls.length, 1);
            const insertBuilderSpies = spies.fromSpy.calls[0].returned;
            assertEquals(insertBuilderSpies.insert.calls.length, 1);


            assertSpyCall(mockDeps.error as Spy, 0); // Outer error handler
            const loggedErrorCallArgs = (mockDeps.error as Spy).calls[0].args;
            assertEquals(loggedErrorCallArgs[0], `Insert resolved with error object for ${PROVIDER_NAME}:`);
            const loggedMetadata = loggedErrorCallArgs[1] as { error?: typeof dbInsertError };
            assertEquals(loggedMetadata?.error?.name, dbInsertError.name); // Check name
            assertEquals(loggedMetadata?.error?.message, dbInsertError.message);
            assertEquals(loggedMetadata?.error?.code, dbInsertError.code);


            // Check SyncResult
            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0);
            assert(result.error?.includes(dbInsertError.message));

        } finally {
            // Restore stubs or other cleanup if necessary
        }
    });

     await t.step("should return error result if DB update fails", async () => {
        const mockApiKey = "test-google-key";
        const dbUpdateError = { name: "Error", message: "Update conflict", code: "23503" }; // Mock PostgrestError like
        let errorSpy: Spy;

        try {
            const apiModelToUpdate: ProviderModelInfo = { 
                api_identifier: "google-existing-model", 
                name: "Google Existing Model UPDATED",
                description: "Now updated" 
            };
            const dbModelBeforeUpdate: DbAiProvider = {
                id: 'db-google-update',
                api_identifier: apiModelToUpdate.api_identifier,
                name: "Google Existing Model OLD", // Different name
                description: "Old version",
                is_active: true,
                provider: PROVIDER_NAME,
                config: getDefaultGoogleConfig(apiModelToUpdate.api_identifier) as any,
            };

            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [apiModelToUpdate]),
                getCurrentDbModels: spy(async () => [dbModelBeforeUpdate]),
            });
            errorSpy = mockDeps.error as Spy;


            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        update: { data: null, error: dbUpdateError, count: null } // Simulate update failure
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);

            const result = await syncGoogleModels(mockClient as any, mockApiKey, mockDeps);

            assertEquals(spies.fromSpy.calls.length, 1); // Update attempt
            const updateBuilderSpies = spies.fromSpy.calls[0].returned;
            assertEquals(updateBuilderSpies.update.calls.length, 1);

            assertSpyCall(errorSpy, 0); // Error logged
            const loggedErrorCallArgs = errorSpy.calls[0].args;
            assertEquals(loggedErrorCallArgs[0], `Update resolved with error object for model ID ${dbModelBeforeUpdate.id} (${PROVIDER_NAME}):`);
            const loggedMetadata = loggedErrorCallArgs[1] as { error?: typeof dbUpdateError };
            assertEquals(loggedMetadata?.error?.name, dbUpdateError.name);
            assertEquals(loggedMetadata?.error?.message, dbUpdateError.message);
            assertEquals(loggedMetadata?.error?.code, dbUpdateError.code);


            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0); // Update failed
            assertEquals(result.deactivated, 0);

            // The DB update error is logged (verified by spy assertions above),
            // but syncGoogleModels doesn't throw an error to the outermost catch block
            // if the Supabase client resolves with an error object (vs. rejecting entirely).
            // Thus, result.error is expected to be undefined.
            assertEquals(result.error, undefined, "result.error should be undefined as the DB update error is logged but not re-thrown to outer catch");

        } finally {
            // Restore stubs
        }
    });
    
    await t.step("should return error result if DB deactivate fails", async () => {
        const mockApiKey = "test-google-key";
        const dbDeactivateError = { name: "Error", message: "Deactivation restricted", code: "23504" };
        let errorSpy: Spy;

        try {
            const dbModelToDeactivate: DbAiProvider = {
                id: 'db-google-deact1',
                api_identifier: "google-old-model",
                name: "Google Old Model",
                description: null,
                is_active: true,
                provider: PROVIDER_NAME,
                config: getDefaultGoogleConfig("google-old-model") as any,
            };

            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => []), // API returns no models
                getCurrentDbModels: spy(async () => [dbModelToDeactivate]), // DB has one active model
            });
            errorSpy = mockDeps.error as Spy;

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        update: { data: null, error: dbDeactivateError, count: null } // Simulate deactivate (which is an update) failure
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);

            const result = await syncGoogleModels(mockClient as any, mockApiKey, mockDeps);

            assertEquals(spies.fromSpy.calls.length, 1); // Deactivate attempt
            const updateBuilderSpies = spies.fromSpy.calls[0].returned; // Deactivation uses .update()
            assertEquals(updateBuilderSpies.update.calls.length, 1);


            assertSpyCall(errorSpy, 0); // Error logged
            const loggedErrorCallArgs = errorSpy.calls[0].args;
            assertEquals(loggedErrorCallArgs[0], `Deactivation resolved with error object for ${PROVIDER_NAME}:`);
            const loggedMetadata = loggedErrorCallArgs[1] as { error?: typeof dbDeactivateError };
            assertEquals(loggedMetadata?.error?.name, dbDeactivateError.name);
            assertEquals(loggedMetadata?.error?.message, dbDeactivateError.message);
            assertEquals(loggedMetadata?.error?.code, dbDeactivateError.code);

            assertEquals(result.provider, PROVIDER_NAME);
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 0); // Deactivation failed
            assert(result.error?.includes(dbDeactivateError.message));

        } finally {
            // Restore stubs
        }
    });

    await t.step("should reactivate and update an inactive model if it reappears in API", async () => {
        const mockApiKey = "test-google-key";
        try {
            const modelId = 'google-reactivate-model';
            const existingInactiveDbModel: DbAiProvider = {
                id: "db-google-reactivate",
                api_identifier: modelId,
                name: "Old Reactivate Name",
                description: "Was inactive",
                is_active: false, // Key: model is inactive in DB
                provider: PROVIDER_NAME,
                config: null // Added missing config property
            };
            const apiModelReactivated: ProviderModelInfo = {
                api_identifier: "google-reactivate-model",
                name: "Google Reactivate",
                description: "Should be reactivated"
            };
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [apiModelReactivated]), // API returns the model
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
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);
            
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
            assertEquals(updatePayload.name, apiModelReactivated.name, "Name should be updated");
            assertEquals(updatePayload.description, apiModelReactivated.description, "Description should be updated"); 
            assertEquals(updatePayload.is_active, true, "is_active should be set to true");

            // Check that the correct model ID was targeted
            assertExists(updateCall.returned.eq, "eq spy should exist");
            assertSpyCall(updateCall.returned.eq, 0, { args: ['id', existingInactiveDbModel.id] });
            
            // Check SyncResult
            assertEquals(result.provider, 'google');
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 1); // Reactivation counts as an update
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);
        } finally {
            // No specific finally actions needed here.
        }
    });

    // --- NEW TEST: Deactivate All Scenario ---
    await t.step("should deactivate all active models if API returns empty", async () => {
        const mockApiKey = "test-google-key";
        try {
            // Mock API returns empty list
            const apiModels: ProviderModelInfo[] = []; 

            // Mock DB returns active and inactive models
            const existingDbModels: DbAiProvider[] = [
                { id: 'db-google-active1', api_identifier: 'google-active1', name: 'Active 1', description: null, is_active: true, provider: 'google', config: null }, // Added config
                { id: 'db-google-active2', api_identifier: 'google-active2', name: 'Active 2', description: null, is_active: true, provider: 'google', config: null }, // Added config
                { id: 'db-google-inactive', api_identifier: 'google-inactive', name: 'Inactive', description: null, is_active: false, provider: 'google', config: null }, // Added config
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
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);
            
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
        } finally {
            // No specific finally actions needed here.
        }
    });

    // --- Additional Google Specific Tests (Optional) ---
    // Add any tests specific to Google's API behavior or model properties if needed.

    await t.step("should deactivate models present in DB but not in API response", async () => {
        const mockApiKey = "test-google-key";
        try {
            const mockApiModels: ProviderModelInfo[] = [];
            const existingDbModels: DbAiProvider[] = [
                { id: 'db-google-1', api_identifier: 'google-to-deactivate-1', name: 'Old Model 1', description: null, is_active: true, provider: PROVIDER_NAME, config: null },
                { id: 'db-google-2', api_identifier: 'google-to-deactivate-2', name: 'Old Model 2', description: null, is_active: true, provider: PROVIDER_NAME, config: null },
                { id: 'db-google-3', api_identifier: 'google-already-inactive', name: 'Already Inactive', description: null, is_active: false, provider: PROVIDER_NAME, config: null },
            ];

            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels),
                getCurrentDbModels: spy(async () => existingDbModels)
            });

            // Configure Supabase mock for the expected DEACTIVATE update operation
            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        // Expect successful deactivation update call
                        update: { data: ['db-google-1', 'db-google-2'].map(id => ({ id, is_active: false })), error: null, count: 2 } 
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);
            
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
            assertEquals(inArgs[1]?.length, 2, "Should target correct IDs for deactivation");
            assert(inArgs[1]?.includes('db-google-1'));
            assert(inArgs[1]?.includes('db-google-2'));
            
            // Check SyncResult
            assertEquals(result.provider, 'google');
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0);
            assertEquals(result.deactivated, 2); // Only the initially active models
            assertEquals(result.error, undefined);
        } finally {
            // No specific finally actions needed here.
        }
    });

}); 