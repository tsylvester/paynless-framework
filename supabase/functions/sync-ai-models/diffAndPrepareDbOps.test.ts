// supabase/functions/sync-ai-models/diffAndPrepareDbOps.test.ts
import { spy, assertSpyCall, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertMatch } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { diffAndPrepareDbOps, executeDbOps, type DbOpLists } from "./diffAndPrepareDbOps.ts";
import type { DbAiProvider } from './index.ts';
import type { FinalAppModelConfig } from '../_shared/types.ts';
import type { ILogger, AiModelExtendedConfig } from "../_shared/types.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../_shared/supabase.mock.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import { isJson } from "../_shared/utils/type_guards.ts";
import { AiModelExtendedConfigSchema } from "../chat/zodSchema.ts";
import isEqual from 'npm:fast-deep-equal';
// --- Test Helpers ---

const createTestConfig = (apiIdentifier: string): AiModelExtendedConfig => ({
    api_identifier: apiIdentifier,
    input_token_cost_rate: 0.00001,
    output_token_cost_rate: 0.00002,
    context_window_tokens: 8192,
    hard_cap_output_tokens: 4096,
    provider_max_input_tokens: 8192,
    provider_max_output_tokens: 4096,
    tokenization_strategy: { type: 'rough_char_count', chars_per_token_ratio: 4 },
});

const createFinalAppModelConfig = (apiIdentifier: string, name: string, overrides: Partial<AiModelExtendedConfig> = {}): FinalAppModelConfig => ({
    api_identifier: apiIdentifier,
    name: name,
    description: `Description for ${name}`,
    config: { ...createTestConfig(apiIdentifier), ...overrides },
});

// --- Test Suite for diffAndPrepareDbOps ---

Deno.test("diffAndPrepareDbOps", async (t) => {

    await t.step("should identify new models for insertion", () => {
        const mockLogger = new MockLogger();
        const assembled: FinalAppModelConfig[] = [
            createFinalAppModelConfig('model-1', 'Model 1'),
        ];
        const dbModels: DbAiProvider[] = [];
        const result = diffAndPrepareDbOps(assembled, dbModels, 'test-provider', mockLogger);

        assertEquals(result.modelsToInsert.length, 1);
        assertEquals(result.modelsToInsert[0].api_identifier, 'model-1');
        assertEquals(result.modelsToUpdate.length, 0);
        assertEquals(result.modelsToDeactivate.length, 0);
    });

    await t.step("should identify existing models for update", () => {
        const mockLogger = new MockLogger();
        const assembled: FinalAppModelConfig[] = [
            createFinalAppModelConfig('model-1', 'Model One Updated'),
        ];
        const testConfig = createTestConfig('model-1'); 
        if(isJson(testConfig)) {
        const dbModels: DbAiProvider[] = [
            { id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: 'Description for Model One', is_active: true, provider: 'test-provider', config: testConfig }
        ];
        const result = diffAndPrepareDbOps(assembled, dbModels, 'test-provider', mockLogger);

        assertEquals(result.modelsToUpdate.length, 1);
        assertEquals(result.modelsToUpdate[0].id, 'db-1');
        assertEquals(result.modelsToUpdate[0].changes.name, 'Model One Updated');
        assertEquals(result.modelsToInsert.length, 0);
        assertEquals(result.modelsToDeactivate.length, 0);
        }
    });

    await t.step("should identify missing models for deactivation", () => {
        const mockLogger = new MockLogger();
        const assembled: FinalAppModelConfig[] = [];       
        const testConfig = createTestConfig('model-1'); 
        if(isJson(testConfig)) {
        const dbModels: DbAiProvider[] = [
            { id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: 'Description for Model One', is_active: true, provider: 'test-provider', config: testConfig }
        ];
        const result = diffAndPrepareDbOps(assembled, dbModels, 'test-provider', mockLogger);

        assertEquals(result.modelsToDeactivate.length, 1);
        assertEquals(result.modelsToDeactivate[0], 'db-1');
        assertEquals(result.modelsToInsert.length, 0);
        assertEquals(result.modelsToUpdate.length, 0);
        }
    });

    await t.step("should handle a mix of insert, update, and deactivate", () => {
        const mockLogger = new MockLogger();
        const assembled: FinalAppModelConfig[] = [
            createFinalAppModelConfig('model-1', 'Model One Updated'), // Update
            createFinalAppModelConfig('model-2', 'Model Two'),       // Insert
        ];
        const testConfig1 = createTestConfig('model-1');
        const testConfig3 = createTestConfig('model-3');
        if(isJson(testConfig1) && isJson(testConfig3)) {
        const dbModels: DbAiProvider[] = [
            { id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: 'Description for Model One Updated', is_active: true, provider: 'test-provider', config: testConfig1 },
            { id: 'db-3', api_identifier: 'model-3', name: 'Model Three', description: 'Description for Model Three', is_active: true, provider: 'test-provider', config: testConfig3 }, // Deactivate
        ];
        const result = diffAndPrepareDbOps(assembled, dbModels, 'test-provider', mockLogger);

        assertEquals(result.modelsToInsert.length, 1);
        assertEquals(result.modelsToInsert[0].api_identifier, 'model-2');
        assertEquals(result.modelsToUpdate.length, 1);
        assertEquals(result.modelsToUpdate[0].id, 'db-1');
        assertEquals(result.modelsToDeactivate.length, 1);
        assertEquals(result.modelsToDeactivate[0], 'db-3');
        }
    });

    await t.step("should not update if config objects are deeply equal but have different key order", () => {
        const mockLogger = new MockLogger();

        // Create base configs that are valid AiModelExtendedConfig objects
        const baseAssembledConfig = createTestConfig('model-1');

        // Introduce the key order difference and nested objects
        const assembledConfigWithReorder = { ...baseAssembledConfig, b: 2, a: 1, c: { y: 2, x: 1 } };
        const dbConfigWithReorder = { ...baseAssembledConfig, a: 1, c: { x: 1, y: 2 }, b: 2 };

        if(isJson(dbConfigWithReorder)) {
            const assembled: FinalAppModelConfig[] = [
                createFinalAppModelConfig('model-1', 'Model One', assembledConfigWithReorder)
            ];
            const dbModels: DbAiProvider[] = [
                { id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: 'Description for Model One', is_active: true, provider: 'test-provider', config: dbConfigWithReorder }
            ];
            const result = diffAndPrepareDbOps(assembled, dbModels, 'test-provider', mockLogger);
    
            assertEquals(result.modelsToUpdate.length, 0, "Should not queue an update for reordered keys");
        }
    });

    await t.step("should force an update for a DB config with a missing 'model' in its 'anthropic_tokenizer' strategy", () => {
        const mockLogger = new MockLogger();

        // 1. Setup: Replicate the exact error from the logs.
        // The assembled config is valid, but the DB config is missing the 'model' property in its strategy.
        const assembled: FinalAppModelConfig[] = [
            createFinalAppModelConfig('anthropic-model-1', 'Anthropic Model 1', { 
                tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-opus-20240229' } 
            }),
        ];
        
        const invalidDbConfig = { 
            ...createTestConfig('anthropic-model-1'),
            tokenization_strategy: { type: 'anthropic_tokenizer' } // Missing 'model' property
        };

        // Confirm the db config is actually invalid for the test's integrity.
        const validationResult = AiModelExtendedConfigSchema.safeParse(invalidDbConfig);
        assertEquals(validationResult.success, false, "Test setup failed: The mock DB config should be invalid based on the real-world error.");

        if (isJson(invalidDbConfig)) {
            const dbModels: DbAiProvider[] = [
                { id: 'db-anthropic-invalid', api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: '', is_active: true, provider: 'anthropic', config: invalidDbConfig }
            ];

            // 2. Action: Run the diff.
            const result = diffAndPrepareDbOps(assembled, dbModels, 'anthropic', mockLogger);

            if (isJson(assembled[0].config)) {
            // 3. Assertion: The function MUST detect the invalid DB config and queue it for replacement.
            assertEquals(result.modelsToUpdate.length, 1, "Should have queued the model with the invalid 'anthropic_tokenizer' strategy for an update.");
            assertEquals(result.modelsToUpdate[0].id, 'db-anthropic-invalid');
            assertEquals(result.modelsToUpdate[0].changes.config, assembled[0].config);
            }
        } else {
            assert(false, "Test setup failed: invalidDbConfig should be valid JSON");
        }
    });
});

// --- Test Suite for executeDbOps ---

Deno.test("executeDbOps", async (t) => {
    
    await t.step("should call insert for modelsToInsert", async () => {
        const mockLogger = new MockLogger();
        const ops: DbOpLists = {
            modelsToInsert: [{ api_identifier: 'insert-1', name: 'Insert 1', description: '', provider: 'test', config: null }],
            modelsToUpdate: [],
            modelsToDeactivate: [],
        };
        const mockSupabaseConfig: MockSupabaseDataConfig = {
            genericMockResults: { ai_providers: { insert: { data: [], error: null, count: 1 } } }
        };
        const { client, spies } = createMockSupabaseClient(undefined, mockSupabaseConfig);

        const result = await executeDbOps(client as unknown as SupabaseClient, 'test', ops, mockLogger);

        assertSpyCall(spies.fromSpy.calls[0].returned.insert, 0, { args: [ops.modelsToInsert] });
        assertEquals(result.inserted, 1);
        assertEquals(result.updated, 0);
        assertEquals(result.deactivated, 0);
    });

    await t.step("should call update for modelsToUpdate", async () => {
        const mockLogger = new MockLogger();
        const ops: DbOpLists = {
            modelsToInsert: [],
            modelsToUpdate: [{ id: 'update-1', changes: { name: 'Updated Name' } }],
            modelsToDeactivate: [],
        };
         const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: { ai_providers: { update: { data: [], error: null, count: 1 } } }
        });

        const result = await executeDbOps(client as unknown as SupabaseClient, 'test', ops, mockLogger);

        const updateSpy = spies.fromSpy.calls[0].returned.update;
        assertExists(updateSpy);
        assertSpyCall(updateSpy, 0, { args: [ops.modelsToUpdate[0].changes] });
        
        const eqSpy = spies.fromSpy.calls[0].returned.eq;
        assertExists(eqSpy);
        assertSpyCall(eqSpy, 0, { args: ['id', 'update-1'] });

        assertEquals(result.updated, 1);
    });

    await t.step("should call update with in-filter for modelsToDeactivate", async () => {
        const mockLogger = new MockLogger();
        const ops: DbOpLists = {
            modelsToInsert: [],
            modelsToUpdate: [],
            modelsToDeactivate: ['deactivate-1', 'deactivate-2'],
        };
        const { client, spies } = createMockSupabaseClient(undefined, {
            genericMockResults: { ai_providers: { update: { data: [], error: null, count: 2 } } }
        });

        const result = await executeDbOps(client as unknown as SupabaseClient, 'test', ops, mockLogger);

        const updateSpy = spies.fromSpy.calls[0].returned.update;
        assertExists(updateSpy);
        assertSpyCall(updateSpy, 0, { args: [{ is_active: false }] });

        const inSpy = spies.fromSpy.calls[0].returned.in;
        assertExists(inSpy);
        assertSpyCall(inSpy, 0, { args: ['id', ops.modelsToDeactivate] });
        
        assertEquals(result.deactivated, 2);
    });
});

Deno.test({
    name: "diffAndPrepareDbOps - should force an update when a database config is schema-invalid",
    fn: () => {
        const mockLogger = new MockLogger();

        // 1. Setup: Replicate the exact known error. The assembler provides a valid config.
        // The database holds a config that is invalid because it violates the Zod schema.
        const assembled: FinalAppModelConfig[] = [
            createFinalAppModelConfig('anthropic-model-1', 'Anthropic Model 1', { 
                tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-opus-20240229' } 
            }),
        ];
        
        const invalidDbConfig = { 
            ...createTestConfig('anthropic-model-1'),
            // This is the specific invalid structure found in the wild.
            tokenization_strategy: { type: 'anthropic_tokenizer' } // It's missing the 'model' property.
        };

        // This assertion just confirms the test itself is set up correctly.
        assertEquals(AiModelExtendedConfigSchema.safeParse(invalidDbConfig).success, false, "Test setup check: The mock DB config must be invalid.");

        if (isJson(invalidDbConfig)) {
            const dbModels: DbAiProvider[] = [
                { id: 'db-anthropic-invalid', api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: '', is_active: true, provider: 'anthropic', config: invalidDbConfig }
            ];

            // 2. Action: Run the diffing logic.
            const result = diffAndPrepareDbOps(assembled, dbModels, 'anthropic', mockLogger);

            // 3. Assertion: This MUST queue an update. The ONLY way to guarantee this is to
            // validate the database config with Zod, not just check for structural equality.
            assertEquals(result.modelsToUpdate.length, 1, "A model with a schema-invalid DB config was not queued for update.");
            assertEquals(result.modelsToUpdate[0].id, 'db-anthropic-invalid');
        } else {
            assert(false, "Test setup failed: invalidDbConfig should be valid JSON");
        }
    },
});

Deno.test({
    name: "diffAndPrepareDbOps - should NOT queue an insert for a schema-invalid assembled config",
    fn: () => {
        const mockLogger = new MockLogger();

        // 1. Setup: Create an assembled config that is INVALID, using the exact error from the logs.
        const invalidConfig = { 
            ...createTestConfig('anthropic-model-1'),
            tokenization_strategy: { type: 'anthropic_tokenizer' } // Missing 'model' property
        } as unknown as Partial<AiModelExtendedConfig>;

        const assembled: FinalAppModelConfig[] = [
            createFinalAppModelConfig('anthropic-model-1', 'Anthropic Model 1', invalidConfig)
        ];
        
        // 2. Scenario: The database is empty, so this should be an insert.
        const dbModels: DbAiProvider[] = [];
        
        // 3. Action: Run the diff.
        const result = diffAndPrepareDbOps(assembled, dbModels, 'anthropic', mockLogger);

        // 4. PROOF OF FAILURE: This assertion will fail.
        // The current code does not validate the assembled config with Zod. It will
        // incorrectly add the invalid model to the insert list. A correct implementation
        // must validate the config and refuse to insert invalid data.
        assertEquals(result.modelsToInsert.length, 0, "The function queued an invalid assembled config for insertion.");
    },
});

Deno.test({
    name: "diffAndPrepareDbOps - should force an update for a schema-invalid DB config, even if identical to the assembled config",
    fn: () => {
        const mockLogger = new MockLogger();

        // 1. Setup: The assembled config is VALID.
        const validConfig = createTestConfig('anthropic-model-1');
        const assembled: FinalAppModelConfig[] = [
            createFinalAppModelConfig('anthropic-model-1', 'Anthropic Model 1', validConfig)
        ];
        
        // 2. The DB config is INVALID.
        const invalidDbConfig = { 
            ...createTestConfig('anthropic-model-1'),
            tokenization_strategy: { type: 'anthropic_tokenizer' } // Missing 'model' property
        };

        if (isJson(invalidDbConfig)) {
            const dbModels: DbAiProvider[] = [
                { id: 'db-anthropic-invalid', api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: '', is_active: true, provider: 'anthropic', config: invalidDbConfig }
            ];

            // 3. Action: Run the diff.
            const result = diffAndPrepareDbOps(assembled, dbModels, 'anthropic', mockLogger);

            // 4. Assertion: The function must detect the invalid DB record and queue an update.
            assertEquals(result.modelsToUpdate.length, 1, "The function failed to queue an update for a schema-invalid database record.");
            assertEquals(result.modelsToUpdate[0].id, 'db-anthropic-invalid');
        } else {
            assert(false, "Test setup failed.");
        }
    },
});

Deno.test({
    name: "diffAndPrepareDbOps - proves isEqual passes an invalid config that Zod fails",
    fn: () => {
        const mockLogger = new MockLogger();

        // 1. Setup: An invalid config object, replicating the known error.
        const invalidConfig = { 
            ...createTestConfig('anthropic-model-1'),
            tokenization_strategy: { type: 'anthropic_tokenizer' }
        };

        // 2. PROOF, PART 1: Show that Zod correctly identifies this config as invalid.
        const zodResult = AiModelExtendedConfigSchema.safeParse(invalidConfig);
        assertEquals(zodResult.success, false, "Test check: Zod MUST fail this config.");

        // 3. PROOF, PART 2: isEquals is irrelevant if the DB config is invalid.
        // The primary proof is that the invalid DB record gets replaced.
        
        // 4. Scenario: The assembled config is VALID.
        const assembled: FinalAppModelConfig[] = [
            createFinalAppModelConfig('anthropic-model-1', 'Anthropic Model 1', createTestConfig('anthropic-model-1'))
        ];
        if (isJson(invalidConfig)) {
            const dbModels: DbAiProvider[] = [
                { id: 'db-anthropic-invalid', api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: '', is_active: true, provider: 'anthropic', config: invalidConfig }
            ];

            // 5. Action: Run the diff.
            const result = diffAndPrepareDbOps(assembled, dbModels, 'anthropic', mockLogger);

            // 6. FINAL PROOF OF CORRECTNESS: This assertion will now pass.
            // The function will validate the DB config, see it's invalid, and queue an update.
            assertEquals(result.modelsToUpdate.length, 1, "The function failed to queue an update for a schema-invalid record.");
        } else {
            assert(false, "Test setup failed.");
        }
    },
});

Deno.test({
    name: "diffAndPrepareDbOps - FAILING TEST: should force an update for a schema-invalid DB config without isJson guard",
    fn: () => {
        const mockLogger = new MockLogger();

        const assembled: FinalAppModelConfig[] = [
            createFinalAppModelConfig('anthropic-model-1', 'Anthropic Model 1', { 
                tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-opus-20240229' } 
            }),
        ];
        
        const invalidDbConfig = { 
            ...createTestConfig('anthropic-model-1'),
            tokenization_strategy: { type: 'anthropic_tokenizer' } // Missing 'model' property
        };

        const dbModels: DbAiProvider[] = [
            { id: 'db-anthropic-invalid', api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: '', is_active: true, provider: 'anthropic', config: invalidDbConfig}
        ];

        const result = diffAndPrepareDbOps(assembled, dbModels, 'anthropic', mockLogger);

        assertEquals(result.modelsToUpdate.length, 1, "The function failed to queue an update for a schema-invalid database record.");
        assertEquals(result.modelsToUpdate[0].id, 'db-anthropic-invalid');
    },
});

Deno.test({
    name: "should queue a sanitizing UPDATE for a DB model that is irreparable",
    fn: () => {
        const mockLogger = new MockLogger();

        // 1. The assembled config is INVALID.
        const invalidAssembledModel: FinalAppModelConfig = createFinalAppModelConfig(
            'anthropic-model-1', 
            'Invalid Assembled Model', 
            { tokenization_strategy: { type: 'anthropic_tokenizer' } } as unknown as Partial<AiModelExtendedConfig> // Missing 'model'
        );
        
        // 2. The database config is ALSO INVALID, with a different (or same) error.
        const invalidDbConfig = { 
            ...createTestConfig('anthropic-model-1'),
            context_window_tokens: -1 // Invalid value
        };

        const dbModels: DbAiProvider[] = [
            { 
                id: 'db-anthropic-invalid', 
                api_identifier: 'anthropic-model-1', 
                name: 'Corrupt DB Model', 
                description: '', 
                is_active: true, 
                provider: 'anthropic', 
                config: invalidDbConfig
            }
        ];

        // 3. Action
        const result = diffAndPrepareDbOps([invalidAssembledModel], dbModels, 'anthropic', mockLogger);

        // 4. Assertion: The irreparable model should be queued for an UPDATE that
        // both deactivates it and sanitizes its config to a valid default.
        assertEquals(result.modelsToDeactivate.length, 0, "A sanitizing update should be queued, not a deactivation.");
        assertEquals(result.modelsToUpdate.length, 1, "Should have queued the irreparable DB model for a sanitizing update.");
        
        const sanitizingUpdate = result.modelsToUpdate[0];
        assertEquals(sanitizingUpdate.id, 'db-anthropic-invalid');
        
        // Assert that the update payload deactivates the model
        assertEquals(sanitizingUpdate.changes.is_active, false, "The sanitizing update must set is_active to false.");

        // Assert that the update payload includes a valid config
        assertExists(sanitizingUpdate.changes.config, "The sanitizing update must include a valid config object.");
        const validation = AiModelExtendedConfigSchema.safeParse(sanitizingUpdate.changes.config);
        assertEquals(validation.success, true, `The sanitizing update config is not valid: ${JSON.stringify(validation.error?.format())}`);
    },
});

Deno.test({
    name: "should sanitize an obsolete DB model with an invalid config instead of just deactivating it",
    fn: () => {
        const mockLogger = new MockLogger();

        // 1. SCENARIO: The provider no longer returns this model, so the assembled list is empty.
        const assembledConfigs: FinalAppModelConfig[] = [];

        // 2. SETUP: The database contains a model with a corrupted config, matching the exact
        // error that causes `update-seed.ts` to fail.
        const invalidDbConfig = {
            api_identifier: 'obsolete-anthropic-model',
            tokenization_strategy: { type: 'anthropic_tokenizer' }, // Missing 'model'
            // Other fields are irrelevant as the structure itself is invalid.
        };

        const dbModels: DbAiProvider[] = [{
            id: 'db-obsolete-invalid',
            api_identifier: 'obsolete-anthropic-model',
            name: 'Obsolete Invalid Model',
            provider: 'anthropic',
            is_active: true,
            description: '',
            config: invalidDbConfig as any, // Cast to bypass TS for the test
        }];

        // 3. ACTION: Run the diff logic.
        const result = diffAndPrepareDbOps(assembledConfigs, dbModels, 'anthropic', mockLogger);

        // 4. ASSERTION (This will fail on the current implementation):
        // The current logic will incorrectly place this model in `modelsToDeactivate`.
        // The correct behavior is to queue a sanitizing UPDATE.
        assertEquals(result.modelsToDeactivate.length, 0, "Obsolete invalid models must be sanitized via UPDATE, not just deactivated.");
        assertEquals(result.modelsToUpdate.length, 1, "An obsolete invalid model should be queued for a sanitizing update.");

        const sanitizingUpdate = result.modelsToUpdate[0];
        assertEquals(sanitizingUpdate.id, 'db-obsolete-invalid');
        assertEquals(sanitizingUpdate.changes.is_active, false);
        assertExists(sanitizingUpdate.changes.config, "The sanitizing update must include a valid config.");

        const validation = AiModelExtendedConfigSchema.safeParse(sanitizingUpdate.changes.config);
        assert(validation.success, `The new config should be valid. Error: ${JSON.stringify(validation.error?.format())}`);
    },
});

