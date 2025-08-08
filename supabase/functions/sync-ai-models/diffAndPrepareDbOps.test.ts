// supabase/functions/sync-ai-models/diffAndPrepareDbOps.test.ts
import { spy, assertSpyCall, assertSpyCalls } from "jsr:@std/testing@0.225.1/mock";
import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { diffAndPrepareDbOps, executeDbOps, type DbOpLists } from "./diffAndPrepareDbOps.ts";
import type { DbAiProvider } from './index.ts';
import type { AssembledModelConfig } from './config_assembler.ts';
import type { ILogger, AiModelExtendedConfig } from "../_shared/types.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../_shared/supabase.mock.ts";
import { MockLogger } from "../_shared/logger.mock.ts";
import { isJson } from "../_shared/utils/type_guards.ts";

// --- Test Helpers ---

const createTestConfig = (apiIdentifier: string): AiModelExtendedConfig => ({
    api_identifier: apiIdentifier,
    input_token_cost_rate: 0,
    output_token_cost_rate: 0,
    context_window_tokens: 8192,
    hard_cap_output_tokens: 4096,
    provider_max_input_tokens: 8192,
    provider_max_output_tokens: 4096,
    tokenization_strategy: { type: 'none' },
});

// --- Test Suite for diffAndPrepareDbOps ---

Deno.test("diffAndPrepareDbOps", async (t) => {

    await t.step("should identify new models for insertion", () => {
        const mockLogger = new MockLogger();
        const assembled: AssembledModelConfig[] = [
            { api_identifier: 'model-1', name: 'Model 1', description: '', config: createTestConfig('model-1') }
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
        const assembled: AssembledModelConfig[] = [
            { api_identifier: 'model-1', name: 'Model One Updated', description: '', config: createTestConfig('model-1') }
        ];
        const testConfig = createTestConfig('model-1'); 
        if(isJson(testConfig)) {
        const dbModels: DbAiProvider[] = [
            { id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: '', is_active: true, provider: 'test-provider', config: testConfig }
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
        const assembled: AssembledModelConfig[] = [];       
        const testConfig = createTestConfig('model-1'); 
        if(isJson(testConfig)) {
        const dbModels: DbAiProvider[] = [
            { id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: '', is_active: true, provider: 'test-provider', config: testConfig }
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
        const assembled: AssembledModelConfig[] = [
            { api_identifier: 'model-1', name: 'Model One Updated', description: '', config: createTestConfig('model-1') }, // Update
            { api_identifier: 'model-2', name: 'Model Two', description: '', config: createTestConfig('model-2') },           // Insert
        ];
        const testConfig1 = createTestConfig('model-1');
        const testConfig2 = createTestConfig('model-2');
        const testConfig3 = createTestConfig('model-3');
        if(isJson(testConfig1) && isJson(testConfig2) && isJson(testConfig3)) {
        const dbModels: DbAiProvider[] = [
            { id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: '', is_active: true, provider: 'test-provider', config: testConfig1 },
            { id: 'db-3', api_identifier: 'model-3', name: 'Model Three', description: '', is_active: true, provider: 'test-provider', config: testConfig3 }, // Deactivate
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
        const baseDbConfig = createTestConfig('model-1');

        // Introduce the key order difference and nested objects
        const assembledConfig = { ...baseAssembledConfig, b: 2, a: 1, c: { y: 2, x: 1 } };
        const dbConfig = { ...baseAssembledConfig, a: 1, c: { x: 1, y: 2 }, b: 2 };

        if(isJson(assembledConfig) && isJson(dbConfig)) {
            const assembled: AssembledModelConfig[] = [
                { api_identifier: 'model-1', name: 'Model One', description: '', config: assembledConfig }
            ];
            const dbModels: DbAiProvider[] = [
                { id: 'db-1', api_identifier: 'model-1', name: 'Model One', description: '', is_active: true, provider: 'test-provider', config: dbConfig }
            ];
            const result = diffAndPrepareDbOps(assembled, dbModels, 'test-provider', mockLogger);
    
            assertEquals(result.modelsToUpdate.length, 0, "Should not queue an update for reordered keys");
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

