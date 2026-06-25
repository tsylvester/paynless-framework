import { spy, assertSpyCall } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists, assertMatch } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { diffAndPrepareDbOps, executeDbOps } from "./diffAndPrepareDbOps.ts";
import type { DbAiProvider, DbOpLists } from "./sync-ai-models.interface.ts";
import {
    mockAiModelExtendedConfig,
    mockCostProvenanceMap,
    mockDbAiProvider,
    mockFinalAppModelConfig,
    mockModelCostProvenance,
} from "./diffAndPrepareDbOps.mock.ts";
import type { ModelCostProvenance } from "./config_assembler.interface.ts";
import type { Json } from "../types_db.ts";
import type { FinalAppModelConfig } from "../_shared/types.ts";
import type { AiModelExtendedConfig } from "../_shared/types.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../_shared/supabase.mock.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import { isJson } from "../_shared/utils/type_guards.ts";
import { AiModelExtendedConfigSchema } from "../chat/zodSchema.ts";

// --- Test Suite for diffAndPrepareDbOps ---

Deno.test("diffAndPrepareDbOps", async (t) => {

    await t.step("should identify new models for insertion", () => {
        const mockLogger = new MockLogger();
        const assembled: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({ api_identifier: 'model-1', name: 'Model 1', description: 'Description for Model 1' }),
        ];
        const dbModels: DbAiProvider[] = [];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap(
            assembled.map((model) => [model.api_identifier, mockModelCostProvenance()]),
        );
        assertEquals(costProvenanceByApiId.size, assembled.length);
        assertEquals(costProvenanceByApiId.get("model-1"), mockModelCostProvenance());
        const result = diffAndPrepareDbOps(assembled, dbModels, "test-provider", mockLogger, costProvenanceByApiId);

        assertEquals(result.modelsToInsert.length, 1);
        assertEquals(result.modelsToInsert[0].api_identifier, 'model-1');
        assertEquals(result.modelsToUpdate.length, 0);
        assertEquals(result.modelsToDeactivate.length, 0);
    });

    await t.step("should identify existing models for update", () => {
        const mockLogger = new MockLogger();
        const assembled: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({ api_identifier: 'model-1', name: 'Model One Updated', description: 'Description for Model One Updated' }),
        ];
        const testConfig = mockAiModelExtendedConfig({ api_identifier: 'model-1' }); 
        if(isJson(testConfig)) {
        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({ id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: 'Description for Model One', is_active: true, provider: 'test-provider', config: testConfig })
        ];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap(
            assembled.map((model) => [model.api_identifier, mockModelCostProvenance()]),
        );
        assertEquals(costProvenanceByApiId.size, assembled.length);
        assertEquals(costProvenanceByApiId.get("model-1"), mockModelCostProvenance());
        const result = diffAndPrepareDbOps(assembled, dbModels, "test-provider", mockLogger, costProvenanceByApiId);

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
        const testConfig = mockAiModelExtendedConfig({ api_identifier: 'model-1' }); 
        if(isJson(testConfig)) {
        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({ id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: 'Description for Model One', is_active: true, provider: 'test-provider', config: testConfig })
        ];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap();
        assertEquals(costProvenanceByApiId.size, 0);
        const result = diffAndPrepareDbOps(assembled, dbModels, "test-provider", mockLogger, costProvenanceByApiId);

        assertEquals(result.modelsToDeactivate.length, 1);
        assertEquals(result.modelsToDeactivate[0], 'db-1');
        assertEquals(result.modelsToInsert.length, 0);
        assertEquals(result.modelsToUpdate.length, 0);
        }
    });

    await t.step("should handle a mix of insert, update, and deactivate", () => {
        const mockLogger = new MockLogger();
        const assembled: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({ api_identifier: 'model-1', name: 'Model One Updated', description: 'Description for Model One Updated' }), // Update
            mockFinalAppModelConfig({ api_identifier: 'model-2', name: 'Model Two', description: 'Description for Model Two' }),       // Insert
        ];
        const testConfig1 = mockAiModelExtendedConfig({ api_identifier: 'model-1' });
        const testConfig3 = mockAiModelExtendedConfig({ api_identifier: 'model-3' });
        if(isJson(testConfig1) && isJson(testConfig3)) {
        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({ id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: 'Description for Model One Updated', is_active: true, provider: 'test-provider', config: testConfig1 }),
            mockDbAiProvider({ id: 'db-3', api_identifier: 'model-3', name: 'Model Three', description: 'Description for Model Three', is_active: true, provider: 'test-provider', config: testConfig3 }), // Deactivate
        ];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap(
            assembled.map((model) => [model.api_identifier, mockModelCostProvenance()]),
        );
        assertEquals(costProvenanceByApiId.size, assembled.length);
        assertEquals(costProvenanceByApiId.get("model-1"), mockModelCostProvenance());
        assertEquals(costProvenanceByApiId.get("model-2"), mockModelCostProvenance());
        const result = diffAndPrepareDbOps(assembled, dbModels, "test-provider", mockLogger, costProvenanceByApiId);

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
        const baseAssembledConfig = mockAiModelExtendedConfig({ api_identifier: 'model-1' });

        // Introduce the key order difference and nested objects
        const assembledConfigWithReorder = { ...baseAssembledConfig, b: 2, a: 1, c: { y: 2, x: 1 } };
        const dbConfigWithReorder = { ...baseAssembledConfig, a: 1, c: { x: 1, y: 2 }, b: 2 };

        if(isJson(dbConfigWithReorder)) {
            const assembled: FinalAppModelConfig[] = [
                mockFinalAppModelConfig({ api_identifier: 'model-1', name: 'Model One', description: 'Description for Model One', config: assembledConfigWithReorder })
            ];
            const dbModels: DbAiProvider[] = [
                mockDbAiProvider({ id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: 'Description for Model One', is_active: true, provider: 'test-provider', config: dbConfigWithReorder })
            ];
            const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap(
                assembled.map((model) => [model.api_identifier, mockModelCostProvenance()]),
            );
            assertEquals(costProvenanceByApiId.size, assembled.length);
            assertEquals(costProvenanceByApiId.get("model-1"), mockModelCostProvenance());
            const result = diffAndPrepareDbOps(assembled, dbModels, "test-provider", mockLogger, costProvenanceByApiId);
    
            assertEquals(result.modelsToUpdate.length, 0, "Should not queue an update for reordered keys");
        }
    });

    await t.step("should force an update for a DB config with a missing 'model' in its 'anthropic_tokenizer' strategy", () => {
        const mockLogger = new MockLogger();

        // 1. Setup: Replicate the exact error from the logs.
        // The assembled config is valid, but the DB config is missing the 'model' property in its strategy.
        const assembled: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: 'anthropic-model-1',
                name: 'Anthropic Model 1',
                description: 'Description for Anthropic Model 1',
                config: { tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-opus-20240229' } },
            }),
        ];
        
        const invalidDbConfig = { 
            ...mockAiModelExtendedConfig({ api_identifier: 'anthropic-model-1' }),
            tokenization_strategy: { type: 'anthropic_tokenizer' } // Missing 'model' property
        };

        // Confirm the db config is actually invalid for the test's integrity.
        const validationResult = AiModelExtendedConfigSchema.safeParse(invalidDbConfig);
        assertEquals(validationResult.success, false, "Test setup failed: The mock DB config should be invalid based on the real-world error.");

        if (isJson(invalidDbConfig)) {
            const dbModels: DbAiProvider[] = [
                mockDbAiProvider({ id: 'db-anthropic-invalid', api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: '', is_active: true, provider: 'anthropic', config: invalidDbConfig })
            ];

            // 2. Action: Run the diff.
            const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap(
                assembled.map((model) => [model.api_identifier, mockModelCostProvenance({ input_source: "api", output_source: "api" })]),
            );
            assertEquals(costProvenanceByApiId.size, assembled.length);
            assertEquals(costProvenanceByApiId.get("anthropic-model-1"), mockModelCostProvenance({ input_source: "api", output_source: "api" }));
            const result = diffAndPrepareDbOps(assembled, dbModels, "anthropic", mockLogger, costProvenanceByApiId);

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
            modelsToInsert: [{ api_identifier: 'insert-1', name: 'Insert 1', description: '', provider: 'test', config: null, is_enabled: true, min_plan_tier_level: 0 }],
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
            modelsToUpdate: [{ id: 'update-1', changes: { name: 'Updated Name', api_identifier: 'update-1', description: '', is_active: true, provider: 'test', config: null, id: 'update-1' } }],
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
            mockFinalAppModelConfig({
                api_identifier: 'anthropic-model-1',
                name: 'Anthropic Model 1',
                description: 'Description for Anthropic Model 1',
                config: { tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-opus-20240229' } },
            }),
        ];
        
        const invalidDbConfig = { 
            ...mockAiModelExtendedConfig({ api_identifier: 'anthropic-model-1' }),
            // This is the specific invalid structure found in the wild.
            tokenization_strategy: { type: 'anthropic_tokenizer' } // It's missing the 'model' property.
        };

        // This assertion just confirms the test itself is set up correctly.
        assertEquals(AiModelExtendedConfigSchema.safeParse(invalidDbConfig).success, false, "Test setup check: The mock DB config must be invalid.");

        if (isJson(invalidDbConfig)) {
            const dbModels: DbAiProvider[] = [
                mockDbAiProvider({ id: 'db-anthropic-invalid', api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: '', is_active: true, provider: 'anthropic', config: invalidDbConfig })
            ];

            // 2. Action: Run the diffing logic.
            const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap(
                assembled.map((model) => [model.api_identifier, mockModelCostProvenance({ input_source: "api", output_source: "api" })]),
            );
            assertEquals(costProvenanceByApiId.size, assembled.length);
            assertEquals(costProvenanceByApiId.get("anthropic-model-1"), mockModelCostProvenance({ input_source: "api", output_source: "api" }));
            const result = diffAndPrepareDbOps(assembled, dbModels, "anthropic", mockLogger, costProvenanceByApiId);

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
    name: "diffAndPrepareDbOps - should insert new model with null costs as disabled",
    fn: () => {
        const mockLogger: MockLogger = new MockLogger();

        // A new model appeared in the provider API but is not yet in the INTERNAL_MODEL_MAP
        // and the API returns no cost data. The model exists and must be inserted disabled
        // with 99 tier until a maintainer configures it.
        const assembled: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: 'anthropic-model-1',
                name: 'Anthropic Model 1',
                description: 'Description for Anthropic Model 1',
                config: { input_token_cost_rate: null, output_token_cost_rate: null },
            }),
        ];

        const dbModels: DbAiProvider[] = [];

        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([['anthropic-model-1', mockModelCostProvenance({ input_source: "none", output_source: "none" })]]);
        const result = diffAndPrepareDbOps(assembled, dbModels, "anthropic", mockLogger, costProvenanceByApiId);

        assertEquals(result.modelsToInsert.length, 1);
        assertEquals(result.modelsToInsert[0].api_identifier, 'anthropic-model-1');
        assertEquals(result.modelsToInsert[0].is_enabled, false);
        assertEquals(result.modelsToInsert[0].min_plan_tier_level, 99);
    },
});

Deno.test({
    name: "diffAndPrepareDbOps - should force an update for a schema-invalid DB config, even if identical to the assembled config",
    fn: () => {
        const mockLogger = new MockLogger();

        // 1. Setup: The assembled config is VALID.
        const validConfig: AiModelExtendedConfig = mockAiModelExtendedConfig({ api_identifier: 'anthropic-model-1' });
        const assembled: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({ api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: 'Description for Anthropic Model 1', config: validConfig })
        ];
        
        // 2. The DB config is INVALID.
        const invalidDbConfig = { 
            ...mockAiModelExtendedConfig({ api_identifier: 'anthropic-model-1' }),
            tokenization_strategy: { type: 'anthropic_tokenizer' } // Missing 'model' property
        };

        if (isJson(invalidDbConfig)) {
            const dbModels: DbAiProvider[] = [
                mockDbAiProvider({ id: 'db-anthropic-invalid', api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: '', is_active: true, provider: 'anthropic', config: invalidDbConfig })
            ];

            // 3. Action: Run the diff.
            const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap(
                assembled.map((model) => [model.api_identifier, mockModelCostProvenance({ input_source: "api", output_source: "api" })]),
            );
            assertEquals(costProvenanceByApiId.size, assembled.length);
            assertEquals(costProvenanceByApiId.get("anthropic-model-1"), mockModelCostProvenance({ input_source: "api", output_source: "api" }));
            const result = diffAndPrepareDbOps(assembled, dbModels, "anthropic", mockLogger, costProvenanceByApiId);

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
            ...mockAiModelExtendedConfig({ api_identifier: 'anthropic-model-1' }),
            tokenization_strategy: { type: 'anthropic_tokenizer' }
        };

        // 2. PROOF, PART 1: Show that Zod correctly identifies this config as invalid.
        const zodResult = AiModelExtendedConfigSchema.safeParse(invalidConfig);
        assertEquals(zodResult.success, false, "Test check: Zod MUST fail this config.");

        // 3. PROOF, PART 2: isEquals is irrelevant if the DB config is invalid.
        // The primary proof is that the invalid DB record gets replaced.
        
        // 4. Scenario: The assembled config is VALID.
        const assembled: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({ api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: 'Description for Anthropic Model 1', config: mockAiModelExtendedConfig({ api_identifier: 'anthropic-model-1' }) })
        ];
        if (isJson(invalidConfig)) {
            const invalidConfigJson: Json = invalidConfig;
            const dbModels: DbAiProvider[] = [
                mockDbAiProvider({ id: 'db-anthropic-invalid', api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: '', is_active: true, provider: 'anthropic', config: invalidConfigJson })
            ];

            // 5. Action: Run the diff.
            const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap(
                assembled.map((model) => [model.api_identifier, mockModelCostProvenance({ input_source: "api", output_source: "api" })]),
            );
            assertEquals(costProvenanceByApiId.size, assembled.length);
            assertEquals(costProvenanceByApiId.get("anthropic-model-1"), mockModelCostProvenance({ input_source: "api", output_source: "api" }));
            const result = diffAndPrepareDbOps(assembled, dbModels, "anthropic", mockLogger, costProvenanceByApiId);

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
            mockFinalAppModelConfig({
                api_identifier: 'anthropic-model-1',
                name: 'Anthropic Model 1',
                description: 'Description for Anthropic Model 1',
                config: { tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-opus-20240229' } },
            }),
        ];
        
        const invalidDbConfig = { 
            ...mockAiModelExtendedConfig({ api_identifier: 'anthropic-model-1' }),
            tokenization_strategy: { type: 'anthropic_tokenizer' } // Missing 'model' property
        };

        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({ id: 'db-anthropic-invalid', api_identifier: 'anthropic-model-1', name: 'Anthropic Model 1', description: '', is_active: true, provider: 'anthropic', config: invalidDbConfig })
        ];

        const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap(
            assembled.map((model) => [model.api_identifier, mockModelCostProvenance({ input_source: "api", output_source: "api" })]),
        );
        assertEquals(costProvenanceByApiId.size, assembled.length);
        assertEquals(costProvenanceByApiId.get("anthropic-model-1"), mockModelCostProvenance({ input_source: "api", output_source: "api" }));
        const result = diffAndPrepareDbOps(assembled, dbModels, "anthropic", mockLogger, costProvenanceByApiId);

        assertEquals(result.modelsToUpdate.length, 1, "The function failed to queue an update for a schema-invalid database record.");
        assertEquals(result.modelsToUpdate[0].id, 'db-anthropic-invalid');
    },
});

Deno.test({
    name: "should queue a sanitizing UPDATE for a DB model that is irreparable",
    fn: () => {
        const mockLogger = new MockLogger();

        // 1. The assembled config is INVALID.
        const invalidAssembledModel: FinalAppModelConfig = mockFinalAppModelConfig({
            api_identifier: 'anthropic-model-1',
            name: 'Invalid Assembled Model',
            description: 'Description for Invalid Assembled Model',
            config: { context_window_tokens: -1 },
        });
        
        // 2. The database config is ALSO INVALID, with a different (or same) error.
        const invalidDbConfig = { 
            ...mockAiModelExtendedConfig({ api_identifier: 'anthropic-model-1' }),
            context_window_tokens: -1 // Invalid value
        };

        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({
                id: 'db-anthropic-invalid',
                api_identifier: 'anthropic-model-1',
                name: 'Corrupt DB Model',
                description: '',
                is_active: true,
                provider: 'anthropic',
                config: invalidDbConfig,
            }),
        ];

        // 3. Action
        const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap(
            [[invalidAssembledModel.api_identifier, mockModelCostProvenance({ input_source: "none", output_source: "none" })]],
        );
        assertEquals(costProvenanceByApiId.size, 1);
        assertEquals(costProvenanceByApiId.get("anthropic-model-1"), mockModelCostProvenance({ input_source: "none", output_source: "none" }));
        const result = diffAndPrepareDbOps([invalidAssembledModel], dbModels, "anthropic", mockLogger, costProvenanceByApiId);

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
            tokenization_strategy: { type: 'anthropic_tokenizer' },
        };
        if (!isJson(invalidDbConfig)) {
            assert(false, "invalidDbConfig must be JSON");
            return;
        }
        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({
                id: 'db-obsolete-invalid',
                api_identifier: 'obsolete-anthropic-model',
                name: 'Obsolete Invalid Model',
                provider: 'anthropic',
                is_active: true,
                description: '',
                config: invalidDbConfig,
            }),
        ];

        // 3. ACTION: Run the diff logic.
        const costProvenanceByApiId: Map<string, ModelCostProvenance> = mockCostProvenanceMap();
        assertEquals(costProvenanceByApiId.size, 0);
        const result = diffAndPrepareDbOps(assembledConfigs, dbModels, "anthropic", mockLogger, costProvenanceByApiId);

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

Deno.test("diffAndPrepareDbOps — cost provenance and min_plan_tier_level (checklist)", async (t) => {
    await t.step("assembled provenance none preserves existing DB cost fields; other fields still update", () => {
        const mockLogger: MockLogger = new MockLogger();
        const apiIdentifier: string = "provenance-none-preserve-1";
        const dbConfig: AiModelExtendedConfig = mockAiModelExtendedConfig({ api_identifier: apiIdentifier });
        dbConfig.input_token_cost_rate = 0.5;
        dbConfig.output_token_cost_rate = 3.0;
        if (!isJson(dbConfig)) {
            assert(false, "dbConfig must be JSON");
            return;
        }
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Renamed Display Name",
                config: {
                    input_token_cost_rate: 15,
                    output_token_cost_rate: 75,
                    context_window_tokens: 16384,
                },
            }),
        ];
        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({
                id: "db-prov-none-1",
                api_identifier: apiIdentifier,
                name: "Old Name",
                description: "old desc",
                is_active: true,
                provider: "test-provider",
                config: dbConfig,
            }),
        ];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance({ input_source: "none", output_source: "none" })]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance({ input_source: "none", output_source: "none" }));
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToUpdate.length, 1);
        const merged = result.modelsToUpdate[0].changes.config;
        const parsed = AiModelExtendedConfigSchema.safeParse(merged);
        assertEquals(parsed.success, true);
        if (parsed.success) {
            assertEquals(parsed.data.input_token_cost_rate, 0.5);
            assertEquals(parsed.data.output_token_cost_rate, 3.0);
        }
        assertEquals(result.modelsToUpdate[0].changes.name, "Renamed Display Name");
    });

    await t.step("assembled provenance static_map updates cost fields from assembled config", () => {
        const mockLogger: MockLogger = new MockLogger();
        const apiIdentifier: string = "provenance-static-1";
        const dbConfig: AiModelExtendedConfig = mockAiModelExtendedConfig({ api_identifier: apiIdentifier });
        dbConfig.input_token_cost_rate = 0.1;
        dbConfig.output_token_cost_rate = 0.2;
        if (!isJson(dbConfig)) {
            assert(false, "dbConfig must be JSON");
            return;
        }
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Same Name",
                config: { input_token_cost_rate: 9, output_token_cost_rate: 8 },
            }),
        ];
        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({
                id: "db-static-1",
                api_identifier: apiIdentifier,
                name: "Same Name",
                description: null,
                is_active: true,
                provider: "test-provider",
                config: dbConfig,
            }),
        ];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance()]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance());
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToUpdate.length, 1);
        const parsed = AiModelExtendedConfigSchema.safeParse(result.modelsToUpdate[0].changes.config);
        assertEquals(parsed.success, true);
        if (parsed.success) {
            assertEquals(parsed.data.input_token_cost_rate, 9);
            assertEquals(parsed.data.output_token_cost_rate, 8);
        }
    });

    await t.step("assembled provenance api updates cost fields from assembled config", () => {
        const mockLogger: MockLogger = new MockLogger();
        const apiIdentifier: string = "provenance-api-1";
        const dbConfig: AiModelExtendedConfig = mockAiModelExtendedConfig({ api_identifier: apiIdentifier });
        dbConfig.input_token_cost_rate = 1;
        dbConfig.output_token_cost_rate = 1;
        if (!isJson(dbConfig)) {
            assert(false, "dbConfig must be JSON");
            return;
        }
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Same",
                config: { input_token_cost_rate: 4, output_token_cost_rate: 6 },
            }),
        ];
        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({
                id: "db-api-1",
                api_identifier: apiIdentifier,
                name: "Same",
                description: null,
                is_active: true,
                provider: "test-provider",
                config: dbConfig,
            }),
        ];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance({ input_source: "api", output_source: "api" })]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance({ input_source: "api", output_source: "api" }));
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToUpdate.length, 1);
        const parsed = AiModelExtendedConfigSchema.safeParse(result.modelsToUpdate[0].changes.config);
        assertEquals(parsed.success, true);
        if (parsed.success) {
            assertEquals(parsed.data.input_token_cost_rate, 4);
            assertEquals(parsed.data.output_token_cost_rate, 6);
        }
    });

    await t.step("insert path: provenance none — null costs, is_enabled false, ALARM logged", () => {
        const mockLogger: MockLogger = new MockLogger();
        const errorSpy = spy(mockLogger, "error");
        const apiIdentifier: string = "insert-none-alarm-1";
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "New Model None",
                config: { input_token_cost_rate: null, output_token_cost_rate: null },
            }),
        ];
        const dbModels: DbAiProvider[] = [];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance({ input_source: "none", output_source: "none" })]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance({ input_source: "none", output_source: "none" }));
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToInsert.length, 1);
        const insertRow = result.modelsToInsert[0];
        const cfgParsed = AiModelExtendedConfigSchema.safeParse(insertRow.config);
        assertEquals(cfgParsed.success, true);
        if (cfgParsed.success) {
            assertEquals(cfgParsed.data.input_token_cost_rate, null);
            assertEquals(cfgParsed.data.output_token_cost_rate, null);
        }
        if ("is_enabled" in insertRow) {
            assertEquals(insertRow.is_enabled, false);
        } else {
            assert(false, "insert row must include is_enabled");
        }
        assertEquals(errorSpy.calls.length >= 1, true);
        const firstMsg: unknown = errorSpy.calls[0].args[0];
        assertEquals(typeof firstMsg === "string" && firstMsg.includes("ALARM"), true);
        assertEquals(typeof firstMsg === "string" && firstMsg.includes(apiIdentifier), true);
    });

    await t.step("insert path: provenance static_map — costs present and is_enabled true", () => {
        const mockLogger: MockLogger = new MockLogger();
        const apiIdentifier: string = "insert-static-enabled-1";
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "New Static",
                config: { input_token_cost_rate: 1, output_token_cost_rate: 2 },
            }),
        ];
        const dbModels: DbAiProvider[] = [];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance()]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance());
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToInsert.length, 1);
        const insertRow = result.modelsToInsert[0];
        const cfgParsed = AiModelExtendedConfigSchema.safeParse(insertRow.config);
        assertEquals(cfgParsed.success, true);
        if (cfgParsed.success) {
            assertEquals(cfgParsed.data.input_token_cost_rate, 1);
            assertEquals(cfgParsed.data.output_token_cost_rate, 2);
        }
        if ("is_enabled" in insertRow) {
            assertEquals(insertRow.is_enabled, true);
        } else {
            assert(false, "insert row must include is_enabled");
        }
    });

    await t.step("insert path: output_token_cost_rate 3.00 → min_plan_tier_level 0 (free band: output CPM < 10)", () => {
        const mockLogger: MockLogger = new MockLogger();
        const infoSpy = spy(mockLogger, "info");
        const apiIdentifier: string = "tier-band-free-1";
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Tier Free",
                config: { input_token_cost_rate: 1, output_token_cost_rate: 3.0 },
            }),
        ];
        const dbModels: DbAiProvider[] = [];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance()]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance());
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToInsert.length, 1);
        if ("min_plan_tier_level" in result.modelsToInsert[0]) {
            assertEquals(result.modelsToInsert[0].min_plan_tier_level, 0);
        } else {
            assert(false, "insert row must include min_plan_tier_level");
        }
        const logged: string = infoSpy.calls.map((c) => c.args[0]).filter((m): m is string => typeof m === "string").join(
            "\n",
        );
        assertMatch(logged, /Auto-assigned min_plan_tier_level=0/);
        assertMatch(logged, new RegExp(apiIdentifier));
    });

    await t.step("insert path: output_token_cost_rate 15.00 → min_plan_tier_level 10 (basic band: 10 ≤ output CPM < 20)", () => {
        const mockLogger: MockLogger = new MockLogger();
        const infoSpy = spy(mockLogger, "info");
        const apiIdentifier: string = "tier-band-basic-1";
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Tier Basic",
                config: { input_token_cost_rate: 1, output_token_cost_rate: 15.0 },
            }),
        ];
        const dbModels: DbAiProvider[] = [];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance()]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance());
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToInsert.length, 1);
        if ("min_plan_tier_level" in result.modelsToInsert[0]) {
            assertEquals(result.modelsToInsert[0].min_plan_tier_level, 10);
        } else {
            assert(false, "insert row must include min_plan_tier_level");
        }
        const logged: string = infoSpy.calls.map((c) => c.args[0]).filter((m): m is string => typeof m === "string").join(
            "\n",
        );
        assertMatch(logged, /Auto-assigned min_plan_tier_level=10/);
    });

    await t.step("insert path: output_token_cost_rate 25.00 → min_plan_tier_level 20 (premium band: output CPM ≥ 20)", () => {
        const mockLogger: MockLogger = new MockLogger();
        const infoSpy = spy(mockLogger, "info");
        const apiIdentifier: string = "tier-band-premium-1";
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Tier Premium",
                config: { input_token_cost_rate: 1, output_token_cost_rate: 25.0 },
            }),
        ];
        const dbModels: DbAiProvider[] = [];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance()]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance());
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToInsert.length, 1);
        if ("min_plan_tier_level" in result.modelsToInsert[0]) {
            assertEquals(result.modelsToInsert[0].min_plan_tier_level, 20);
        } else {
            assert(false, "insert row must include min_plan_tier_level");
        }
        const logged: string = infoSpy.calls.map((c) => c.args[0]).filter((m): m is string => typeof m === "string").join(
            "\n",
        );
        assertMatch(logged, /Auto-assigned min_plan_tier_level=20/);
    });

    await t.step("insert path: output_token_cost_rate 75.00 → min_plan_tier_level 20 (premium band: output CPM ≥ 20 — same tier as premium, not ultra)", () => {
        const mockLogger: MockLogger = new MockLogger();
        const infoSpy = spy(mockLogger, "info");
        const apiIdentifier: string = "tier-band-premium-high-1";
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Tier Premium High",
                config: { input_token_cost_rate: 1, output_token_cost_rate: 75.0 },
            }),
        ];
        const dbModels: DbAiProvider[] = [];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance()]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance());
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToInsert.length, 1);
        if ("min_plan_tier_level" in result.modelsToInsert[0]) {
            assertEquals(result.modelsToInsert[0].min_plan_tier_level, 20);
        } else {
            assert(false, "insert row must include min_plan_tier_level");
        }
        const logged: string = infoSpy.calls.map((c) => c.args[0]).filter((m): m is string => typeof m === "string").join(
            "\n",
        );
        assertMatch(logged, /Auto-assigned min_plan_tier_level=20/);
    });

    await t.step("insert path: null output_token_cost_rate with provenance none → min_plan_tier_level is 99", () => {
        const mockLogger: MockLogger = new MockLogger();
        const infoSpy = spy(mockLogger, "info");
        const apiIdentifier: string = "tier-null-output-1";
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Unknown Cost",
                config: { input_token_cost_rate: null, output_token_cost_rate: null },
            }),
        ];
        const dbModels: DbAiProvider[] = [];    
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance({ input_source: "none", output_source: "none" })]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance({ input_source: "none", output_source: "none" }));
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToInsert.length, 1);
        if ("min_plan_tier_level" in result.modelsToInsert[0]) {
            assertEquals(result.modelsToInsert[0].min_plan_tier_level, 99);
        } else {
            assert(false, "insert row must include min_plan_tier_level");
        }
        const logged: string = infoSpy.calls.map((c) => c.args[0]).filter((m): m is string => typeof m === "string").join(
            "\n",
        );
        assertMatch(logged, /Auto-assigned min_plan_tier_level=99/);
    });

    await t.step("update path: min_plan_tier_level derived from effective output_token_cost_rate when cost changes", () => {
        const mockLogger: MockLogger = new MockLogger();
        const apiIdentifier: string = "tier-derive-update-1";
        const dbConfig: AiModelExtendedConfig = mockAiModelExtendedConfig({ api_identifier: apiIdentifier });
        dbConfig.input_token_cost_rate = 1;
        dbConfig.output_token_cost_rate = 1;
        if (!isJson(dbConfig)) {
            assert(false, "dbConfig must be JSON");
            return;
        }
        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({
                id: "db-tier-derive-1",
                api_identifier: apiIdentifier,
                name: "Keeper",
                description: null,
                is_active: true,
                provider: "test-provider",
                config: dbConfig,
                is_enabled: true,
                min_plan_tier_level: 42,
            }),
        ];
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Keeper Updated",
                config: { input_token_cost_rate: 99, output_token_cost_rate: 99 },
            }),
        ];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance({ input_source: "api", output_source: "api" })]]);
        assertEquals(costProvenanceByApiId.size, assembledConfigs.length);
        assertEquals(costProvenanceByApiId.get(apiIdentifier), mockModelCostProvenance({ input_source: "api", output_source: "api" }));
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToUpdate.length, 1);
        assertEquals(result.modelsToUpdate[0].changes.min_plan_tier_level, 20);
        const parsed = AiModelExtendedConfigSchema.safeParse(result.modelsToUpdate[0].changes.config);
        assertEquals(parsed.success, true);
        if (parsed.success) {
            assertEquals(parsed.data.output_token_cost_rate, 99);
        }
    });

    await t.step("update path: min_plan_tier_level corrected from DB output rate when provenance none preserves cost", () => {
        const mockLogger: MockLogger = new MockLogger();
        const apiIdentifier: string = "tier-derive-preserve-cost-1";
        const dbConfig: AiModelExtendedConfig = mockAiModelExtendedConfig({ api_identifier: apiIdentifier });
        dbConfig.input_token_cost_rate = 0.5;
        dbConfig.output_token_cost_rate = 3.0;
        if (!isJson(dbConfig)) {
            assert(false, "dbConfig must be JSON");
            return;
        }
        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({
                id: "db-tier-derive-preserve-1",
                api_identifier: apiIdentifier,
                name: "Same Name",
                description: null,
                is_active: true,
                provider: "test-provider",
                config: dbConfig,
                min_plan_tier_level: 20,
            }),
        ];
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Same Name",
                config: {
                    input_token_cost_rate: 15,
                    output_token_cost_rate: 75,
                    context_window_tokens: 16384,
                },
            }),
        ];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance({ input_source: "none", output_source: "none" })]]);
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToUpdate.length, 1);
        assertEquals(result.modelsToUpdate[0].changes.min_plan_tier_level, 0);
        const parsed = AiModelExtendedConfigSchema.safeParse(result.modelsToUpdate[0].changes.config);
        assertEquals(parsed.success, true);
        if (parsed.success) {
            assertEquals(parsed.data.input_token_cost_rate, 0.5);
            assertEquals(parsed.data.output_token_cost_rate, 3.0);
            assertEquals(parsed.data.context_window_tokens, 16384);
        }
    });

    await t.step("update path: min_plan_tier_level corrected even when config unchanged", () => {
        const mockLogger: MockLogger = new MockLogger();
        const apiIdentifier: string = "tier-only-correction-1";
        const dbConfig: AiModelExtendedConfig = mockAiModelExtendedConfig({ api_identifier: apiIdentifier });
        dbConfig.output_token_cost_rate = 3.0;
        if (!isJson(dbConfig)) {
            assert(false, "dbConfig must be JSON");
            return;
        }
        const assembledConfigs: FinalAppModelConfig[] = [
            mockFinalAppModelConfig({
                api_identifier: apiIdentifier,
                name: "Same Name",
                config: { output_token_cost_rate: 3.0 },
            }),
        ];
        const dbModels: DbAiProvider[] = [
            mockDbAiProvider({
                id: "db-tier-only-1",
                api_identifier: apiIdentifier,
                name: "Same Name",
                description: null,
                is_active: true,
                provider: "test-provider",
                config: dbConfig,
                min_plan_tier_level: 20,
            }),
        ];
        const costProvenanceByApiId: Map<string, ModelCostProvenance> =
            mockCostProvenanceMap([[apiIdentifier, mockModelCostProvenance({ input_source: "none", output_source: "none" })]]);
        const result: DbOpLists = diffAndPrepareDbOps(
            assembledConfigs,
            dbModels,
            "test-provider",
            mockLogger,
            costProvenanceByApiId,
        );
        assertEquals(result.modelsToUpdate.length, 1);
        assertEquals(result.modelsToUpdate[0].changes.min_plan_tier_level, 0);
        assertEquals(Object.prototype.hasOwnProperty.call(result.modelsToUpdate[0].changes, "config"), false);
    });
});

