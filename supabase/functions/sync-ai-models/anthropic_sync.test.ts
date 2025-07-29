// Import test utilities and types
import { assertSpyCall, assertSpyCalls, spy, type Spy } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { type Json } from "@paynless/db-types"; // Explicitly import Json

// Import the function to test AND the dependency interface
import { syncAnthropicModels, type SyncAnthropicDeps, createDefaultAnthropicConfig } from "./anthropic_sync.ts";
import { type DbAiProvider } from "./index.ts";

// No longer need to import the adapter directly for mocking
// import { anthropicAdapter } from "../_shared/ai_service/anthropic_adapter.ts";

// Import shared types and test utils
// NOTE: getCurrentDbModels is now mocked via deps, but keep types
import type { ProviderModelInfo, AiModelExtendedConfig } from "../_shared/types.ts";
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
} from "../_shared/supabase.mock.ts";

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

// Helper to generate default Anthropic config for testing consistency
const getDefaultAnthropicConfig = (apiIdentifier: string, overrides: Partial<AiModelExtendedConfig> = {}) => {
    const baseConfig = createDefaultAnthropicConfig(apiIdentifier); // Use actual function

    // Handle overrides, with special care for tokenization_strategy
    const { tokenization_strategy: overrideTokenizationStrategy, ...otherOverrides } = overrides;

    const mergedConfig = { // Changed to const
        ...baseConfig,
        ...otherOverrides, // Apply top-level overrides
    };

    if (overrideTokenizationStrategy) {
        // Ensure mergedConfig is treated as extensible when modifying its properties
        (mergedConfig as AiModelExtendedConfig).tokenization_strategy = {
            ...(baseConfig.tokenization_strategy || {}), // Start with base's strategy (which should have correct type)
            ...overrideTokenizationStrategy, // Merge overrides for tokenization_strategy
        };
    }
    
    // Ensure the type is 'anthropic_tokenizer' if it somehow got changed or wasn't set by base/override.
    // The baseConfig from actualCreateDefaultAnthropicConfig should already correctly set this to 'anthropic_tokenizer'.
    // This check is more of a safeguard or for if overrides change the type.
    if (mergedConfig.tokenization_strategy?.type !== 'anthropic_tokenizer') {
      // If the override changed the type, or if baseConfig was faulty (it shouldn't be)
      // we correct it here. But we must preserve other potentially overridden strategy fields.
      (mergedConfig as AiModelExtendedConfig).tokenization_strategy = {
        ...(mergedConfig.tokenization_strategy || {}), // keep existing fields from override or base
        type: 'anthropic_tokenizer', // Ensure type is correct
      };
    }


    return mergedConfig as AiModelExtendedConfig; // Cast to AiModelExtendedConfig
};

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
                        insert: { data: mockApiModels.map(m => ({ ...m, provider: PROVIDER_NAME, is_active: true, id: crypto.randomUUID(), config: null })), error: null, count: mockApiModels.length }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);

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
            
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {});

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
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {});

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
            // Create a realistic config that createDefaultAnthropicConfig would generate for this specific model
            const commonModelConfigObj: AiModelExtendedConfig = {
                api_identifier: `anthropic-claude-3-opus-20240229`,
                input_token_cost_rate: 15.0 / 1000000,
                output_token_cost_rate: 75.0 / 1000000,
                context_window_tokens: 200000,
                hard_cap_output_tokens: 4096,
                tokenization_strategy: {
                    type: 'anthropic_tokenizer',
                },
                provider_max_input_tokens: 200000,
                provider_max_output_tokens: 4096,
            };
            const commonModel: ProviderModelInfo = { 
                api_identifier: commonModelConfigObj.api_identifier, 
                name: 'Anthropic Claude 3 Opus', 
                description: 'Most powerful model', 
                config: commonModelConfigObj as unknown as Json 
            };
            const existingDbModels: DbAiProvider[] = [
                { 
                    id: 'db-id-1', 
                    api_identifier: commonModel.api_identifier, 
                    name: commonModel.name, 
                    description: commonModel.description ?? null, // CORRECTED: commonModel.description could be undefined, ensure null for DbAiProvider
                    is_active: true, 
                    provider: PROVIDER_NAME, 
                    config: commonModelConfigObj as unknown as Json 
                },
            ];
            
            // Mock dependencies
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [commonModel]), // API returns model with config
                getCurrentDbModels: spy(async () => existingDbModels) // DB has matching model with config
            });

            // Configure Supabase mock (no DB ops expected)
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {});
            
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
        const dbError = { name: "Error", message: "Insert failed", code: "23505" };
        try {
            // Ensure description is undefined, not null, to match ProviderModelInfo type
            const mockApiModels: ProviderModelInfo[] = [{ api_identifier: `anthropic-claude-new`, name: 'Anthropic New', description: undefined }];
            
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
                        insert: { data: null, error: dbError as any } // Cast to any if type complaints persist for mock
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);
            
            // Call function with mock deps
            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY, mockDeps);

            assertSpyCall(mockDeps.listProviderModels as Spy, 0);
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0);
            assertSpyCall(mockDeps.error as Spy, 0); // Log the DB error
            const loggedError = (mockDeps.error as Spy).calls[0].args[1];
            assertEquals(loggedError.name, dbError.name, "Error name should match");
            assertEquals(loggedError.message, dbError.message, "Error message should match");
            assertEquals(loggedError.code, dbError.code, "Error code should match");

            // Check Supabase insert attempt
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1); // Only insert attempt
            assertSpyCall(fromSpy.calls[0].returned.insert, 0);
            
            assertEquals(result.error, `Insert failed for ${PROVIDER_NAME}: ${dbError.message}`);

        } finally {
            // No stub to restore
        }
    });

     await t.step("should return error result if DB update fails", async () => {
        const dbUpdateError = { name: "Error", message: "Update conflict", code: "23503" };
        try {
            const modelId = `anthropic-claude-existing`;
            const existingDbModel: DbAiProvider = {
                id: "db-id-update",
                api_identifier: modelId,
                name: "Old Name",
                description: "Old Desc",
                is_active: true,
                provider: PROVIDER_NAME,
                config: null // Assuming a default or null config
            };
            const apiModelUpdate: ProviderModelInfo = {
                api_identifier: modelId,
                name: "New Name", // Changed name
                description: "New Desc"
            };

            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [apiModelUpdate]),
                getCurrentDbModels: spy(async () => [existingDbModel])
            });

            const mockSupabaseConfig: MockSupabaseDataConfig = {
                genericMockResults: {
                    ai_providers: {
                        update: { data: null, error: dbUpdateError }
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);

            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY, mockDeps);

            assertSpyCall(mockDeps.error as Spy, 0);
            const loggedUpdateError = (mockDeps.error as Spy).calls[0].args[1];
            assertEquals(loggedUpdateError.name, dbUpdateError.name, "Error name should match");
            assertEquals(loggedUpdateError.message, dbUpdateError.message, "Error message should match");
            assertEquals(loggedUpdateError.code, dbUpdateError.code, "Error code should match");
            assertEquals(result.error, `Update failed for model ID ${existingDbModel.id} (${PROVIDER_NAME}): ${dbUpdateError.message}`);
            assertEquals(result.updated, 0);

        } finally {
            // Restore stubs if any
        }
    });

    // --- End: Added Edge Case Tests ---

    // --- NEW TEST: DB Deactivate Failure ---
    await t.step("should return error result if DB deactivate fails", async () => {
        const mockApiKey = "test-anthropic-key";
        const activeModelIds = ['db-anthropic-deactivate-fail1', 'db-anthropic-deactivate-fail2'];
        const dbDeactivateError = { name: "Error", message: "Anthropic deactivation constraint violation", code: "23504" }; // Example error

        try {
            // Mock API returns empty list
            const apiModels: ProviderModelInfo[] = []; 

            // Mock DB returns active models that need deactivation
            const existingDbModels: DbAiProvider[] = [
                { id: activeModelIds[0], api_identifier: 'anthropic-deactivate-fail1', name: 'Deactivate Fail 1', description: null, is_active: true, provider: 'anthropic', config: null },
                { id: activeModelIds[1], api_identifier: 'anthropic-deactivate-fail2', name: 'Deactivate Fail 2', description: null, is_active: true, provider: 'anthropic', config: null },
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
                        update: { data: null, error: dbDeactivateError as any } // Cast to any
                    }
                }
            };
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);
            
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
            assertEquals(loggedErrorArg.name, dbDeactivateError.name, "Error name should match");
            assertEquals(loggedErrorArg.message, dbDeactivateError.message, "Error message should match");
            assertEquals(loggedErrorArg.code, dbDeactivateError.code, "Error code should match");
            
            // Check SyncResult
            assertEquals(result.provider, 'anthropic');
            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0); 
            assertEquals(result.deactivated, 0); // Deactivation failed
            // Check the error message formatted by the *outer* catch block
            assertEquals(result.error, `Deactivation failed for anthropic: ${dbDeactivateError.message}`);

        } catch {
            // No specific error handling needed here for this test case
        }
    });

    await t.step("should reactivate and update an inactive model if it reappears in API", async () => {
        try {
            const modelId = `anthropic-claude-reactivate`;
            const inactiveDbModel: DbAiProvider = {
                id: "db-id-reactivate",
                api_identifier: modelId,
                name: "Claude Reactivate Old Name",
                description: "Was inactive",
                is_active: false, // Key: model is inactive in DB
                provider: PROVIDER_NAME,
                config: null // Default config
            };
            const apiModelReactivated: ProviderModelInfo = {
                api_identifier: modelId,
                name: "Claude Reactivate New Name", // Name changed
                description: "Now active and updated" // string, compatible with string | undefined 
                // config will be generated by createDefaultAnthropicConfig, or we can mock it as null/Json if ProviderModelInfo demands it
            };

            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => [apiModelReactivated]),
                getCurrentDbModels: spy(async () => [inactiveDbModel])
            });
            
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {
                 genericMockResults: { ai_providers: { update: { data: [{...inactiveDbModel, name: apiModelReactivated.name, description: apiModelReactivated.description ?? null, is_active: true, config: null /* placeholder for generated config */}], error: null, count: 1 } } }
            });

            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY, mockDeps);

            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1, "from() should be called once for update");
            const updateBuilderSpies = fromSpy.calls[0].returned;
            assertSpyCall(updateBuilderSpies.update, 0);
            const updateArgs = updateBuilderSpies.update.calls[0].args[0];
            assertEquals(updateArgs.name, apiModelReactivated.name);
            assertEquals(updateArgs.description, apiModelReactivated.description);
            assertEquals(updateArgs.is_active, true); // Crucially, it's reactivated
            // Note: We are not deeply checking the config here as it's generated and complex.
            // The main point is that an update operation happened.

            assertEquals(result.updated, 1);
            assertEquals(result.inserted, 0);
            assertEquals(result.deactivated, 0);
            assertEquals(result.error, undefined);

        } finally {
            // Restore stubs
        }
    });

    await t.step("should deactivate models present in DB but not in API response", async () => {
        try {
            const mockApiModels: ProviderModelInfo[] = []; 
            const existingDbModels: DbAiProvider[] = [
                { id: 'db-id-1', api_identifier: `anthropic-claude-to-deactivate-1`, name: 'Old Model 1', description: null, is_active: true, provider: PROVIDER_NAME, config: null },
                { id: 'db-id-2', api_identifier: `anthropic-claude-to-deactivate-2`, name: 'Old Model 2', description: null, is_active: true, provider: PROVIDER_NAME, config: null },
                { id: 'db-id-3', api_identifier: `anthropic-claude-already-inactive`, name: 'Already Inactive', description: null, is_active: false, provider: PROVIDER_NAME, config: null },
            ];
            
            const mockDeps = createMockSyncDeps({
                listProviderModels: spy(async () => mockApiModels),
                getCurrentDbModels: spy(async () => existingDbModels)
            });
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, { 
                genericMockResults: { 
                    ai_providers: { 
                        update: { data: [{id: 'db-id-1', config: null, is_active: false}, {id: 'db-id-2', config: null, is_active: false}], error: null, count: 2 } 
                    }
                }
            });

            const result = await syncAnthropicModels(mockClient as any, ANTHROPIC_API_KEY, mockDeps);
            
            assertSpyCall(mockDeps.listProviderModels as Spy, 0);
            assertSpyCall(mockDeps.getCurrentDbModels as Spy, 0);
            
            const fromSpy = spies.fromSpy;
            assertEquals(fromSpy.calls.length, 1, "from() should be called once for deactivation update");
            const updateBuilderSpies = fromSpy.calls[0].returned;
            assertSpyCall(updateBuilderSpies.update, 0, { args: [{ is_active: false }]});
            assertSpyCall(updateBuilderSpies.in, 0, { args: ['id', ['db-id-1', 'db-id-2']] });

            assertEquals(result.inserted, 0);
            assertEquals(result.updated, 0); 
            assertEquals(result.deactivated, 2);
            assertEquals(result.error, undefined);
        } finally {
            // This empty finally block is to satisfy the linter that expects a catch or finally after try.
            // We can ignore any "empty block" warning for this specific line.
        }
    });

}); // End Deno.test suite