// supabase/functions/sync-ai-models/openai_sync.test.ts
import { testSyncContract, type MockProviderData } from "./sync_test_contract.ts";
import { syncOpenAIModels } from "./openai_sync.ts";
import { type DbAiProvider, type SyncResult } from "./index.ts";
import type { AiModelExtendedConfig, FinalAppModelConfig } from "../_shared/types.ts";
import { isJson } from "../_shared/utils/type_guards.ts";
import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.225.3";
import { stub } from "jsr:@std/testing@0.225.1/mock";
import { ConfigAssembler } from "./config_assembler.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import { createMockSupabaseClient } from "../_shared/supabase.mock.ts";
import { type SyncDeps } from "./sync_test_contract.ts";
import { INTERNAL_MODEL_MAP } from "./openai_sync.ts";
import { AiModelExtendedConfigSchema } from "../chat/zodSchema.ts";


const PROVIDER_NAME = 'openai';

// --- Test Data Factory ---

const createTestConfig = (apiIdentifier: string, overrides: Partial<AiModelExtendedConfig> = {}): AiModelExtendedConfig => ({
    api_identifier: apiIdentifier,
    input_token_cost_rate: 0.5 / 1_000_000,
    output_token_cost_rate: 1.5 / 1_000_000,
    context_window_tokens: 16385,
    hard_cap_output_tokens: 4096,
    provider_max_input_tokens: 16385,
    provider_max_output_tokens: 4096,
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base', is_chatml_model: true, api_identifier_for_tokenization: apiIdentifier },
    ...overrides
});

const assembledGpt4Config = createTestConfig('gpt-4-turbo');
assert(isJson(assembledGpt4Config), "assembledGpt4Config must be valid JSON");
const assembledGpt4: FinalAppModelConfig = { api_identifier: `gpt-4-turbo`, name: "GPT-4 Turbo", description: "A solid model.", config: assembledGpt4Config };

const assembledGptNewConfig = createTestConfig('gpt-new-model');
assert(isJson(assembledGptNewConfig), "assembledGptNewConfig must be valid JSON");
const assembledGptNew: FinalAppModelConfig = { api_identifier: `gpt-new-model`, name: "GPT New", description: "A new model.", config: assembledGptNewConfig };

const assembledGptUpdatedConfig = createTestConfig('gpt-4-turbo', { output_token_cost_rate: 2.0 / 1_000_000 });
assert(isJson(assembledGptUpdatedConfig), "assembledGptUpdatedConfig must be valid JSON");
const assembledGptUpdated: FinalAppModelConfig = { api_identifier: `gpt-4-turbo`, name: "GPT-4 Turbo v2", description: "An updated model.", config: assembledGptUpdatedConfig };

const assembledGptReactivateConfig = createTestConfig('gpt-reactivate');
assert(isJson(assembledGptReactivateConfig), "assembledGptReactivateConfig must be valid JSON");
const assembledGptReactivate: FinalAppModelConfig = { api_identifier: `gpt-reactivate`, name: "Reactivated", description: "It is back.", config: assembledGptReactivateConfig };

const dbGpt4Config = createTestConfig('gpt-4-turbo');
assert(isJson(dbGpt4Config), "dbGpt4Config must be valid JSON");
const dbGpt4: DbAiProvider = {
    id: 'db-id-gpt-4',
    api_identifier: `gpt-4-turbo`,
    name: 'GPT-4 Turbo',
    description: 'A solid model.',
    is_active: true,
    provider: PROVIDER_NAME,
    config: dbGpt4Config,
};

const dbStaleConfig = createTestConfig('gpt-stale');
assert(isJson(dbStaleConfig), "dbStaleConfig must be valid JSON");
const dbStale: DbAiProvider = {
    id: 'db-id-stale',
    api_identifier: `gpt-stale`,
    name: 'Stale Model',
    description: 'This should be deactivated.',
    is_active: true,
    provider: PROVIDER_NAME,
    config: dbStaleConfig
};

const dbInactiveConfig = createTestConfig('gpt-reactivate');
assert(isJson(dbInactiveConfig), "dbInactiveConfig must be valid JSON");
const dbInactive: DbAiProvider = {
    id: 'db-id-inactive',
    api_identifier: `gpt-reactivate`,
    name: 'Reactivated',
    description: 'It is back.',
    is_active: false,
    provider: PROVIDER_NAME,
    config: dbInactiveConfig
};

const mockOpenAIData: MockProviderData = {
    apiModels: [assembledGpt4],
    dbModel: dbGpt4,
    staleDbModel: dbStale,
    inactiveDbModel: dbInactive,
    reactivateApiModel: assembledGptReactivate,
    newApiModel: assembledGptNew,
    updatedApiModel: assembledGptUpdated
};

// --- Test Suite ---

Deno.test("syncOpenAIModels", {
    sanitizeOps: false,
    sanitizeResources: false,
}, async (t) => {
    // Run the standardized test contract
    await testSyncContract(t, syncOpenAIModels, mockOpenAIData, PROVIDER_NAME);

    // --- Provider-Specific Tests ---
    await t.step(`[Provider-Specific] ${PROVIDER_NAME}: should correctly configure and insert an embedding model`, async () => {
        const mockApiKey = "test-api-key";
        const embeddingConfig = createTestConfig("text-embedding-3-small");
        if(embeddingConfig.tokenization_strategy.type === 'tiktoken') {
             embeddingConfig.tokenization_strategy.is_chatml_model = false;
        }
       
        const mockAssembledConfigs: FinalAppModelConfig[] = [
            { api_identifier: "openai-text-embedding-3-small", name: "OpenAI text-embedding-3-small", description: "An embedding model", config: embeddingConfig }
        ];

        // This mock is specific to the syncOpenAIModels function's internal dependency structure.
        const mockDeps: SyncDeps = {
            listProviderModels: async (_apiKey: string) => ({ models: [], raw: {} }),
            getCurrentDbModels: async (_client: SupabaseClient<Database>, _provider: string) => [],
            log: () => {},
            error: () => {},
        };
        
        const assembleStub = stub(ConfigAssembler.prototype, "assemble", () => Promise.resolve(mockAssembledConfigs));

        try {
            const { client: mockClient, spies } = createMockSupabaseClient(undefined, {
                genericMockResults: { ai_providers: { insert: { data: [], error: null, count: 1 } } }
            });

            await syncOpenAIModels(mockClient as unknown as SupabaseClient<Database>, mockApiKey, mockDeps);

            const insertSpy = spies.fromSpy.calls[0]?.returned.insert;
            assertExists(insertSpy);
            const insertArgs = insertSpy.calls[0].args[0];
            assertEquals(insertArgs.length, 1);
            
            const modelConfig: AiModelExtendedConfig = insertArgs[0].config;
            assert(isJson(modelConfig));
            assertExists(modelConfig.tokenization_strategy);
            assertEquals(modelConfig.tokenization_strategy.type, 'tiktoken');
            if (modelConfig.tokenization_strategy.type === 'tiktoken') {
                assertEquals(modelConfig.tokenization_strategy.is_chatml_model, false);
            }
        } finally {
            assembleStub.restore();
        }
    });
});

Deno.test("'INTERNAL_MODEL_MAP should contain valid partial configs'", () => {
    // This test ensures that the hardcoded configurations in the provider's
    // sync file adhere to the Zod schema for partial configurations. This prevents
    // malformed data from being introduced at the source.
    const results = [...INTERNAL_MODEL_MAP.entries()].map(([id, config]) => {
        const result = AiModelExtendedConfigSchema.partial().safeParse(config);
        return { id, success: result.success, error: result.success ? null : result.error.format() };
    });

    const failures = results.filter(r => !r.success);

    assertEquals(failures.length, 0, `Found ${failures.length} invalid configs in INTERNAL_MODEL_MAP: ${JSON.stringify(failures, null, 2)}`);
});
