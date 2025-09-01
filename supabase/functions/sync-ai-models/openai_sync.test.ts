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

// Step 42: Verify per-model tiktoken encoding and ChatML flags for OpenAI models
Deno.test("OpenAI per-model encoding and ChatML flags are mapped correctly", () => {
    // Expected mapping: [modelIdInMap, expectedEncoding, expectedIsChatML]
    const expectations: Array<[string, string, boolean]> = [
        // 4o family
        ['openai-gpt-4o', 'o200k_base', true],
        ['openai-gpt-4o-mini', 'o200k_base', true],
        ['openai-gpt-4.1', 'o200k_base', true],
        ['openai-gpt-4.1-mini', 'o200k_base', true],
        // 4/3.5 classic
        ['openai-gpt-4', 'cl100k_base', true],
        ['openai-gpt-4-turbo', 'cl100k_base', true],
        ['openai-gpt-3.5-turbo', 'cl100k_base', true],
        // Legacy non-ChatML
        ['openai-text-davinci-003', 'p50k_base', false],
        // Embeddings
        ['openai-text-embedding-3-small', 'cl100k_base', false],
        ['openai-text-embedding-3-large', 'cl100k_base', false],
    ];

    for (const [key, expectedEncoding, expectedIsChatML] of expectations) {
        const cfg = INTERNAL_MODEL_MAP.get(key);
        assertExists(cfg, `Missing INTERNAL_MODEL_MAP entry for ${key}`);
        const strat = (cfg as Partial<AiModelExtendedConfig>).tokenization_strategy;
        assertExists(strat, `tokenization_strategy missing for ${key}`);
        // Ensure type is tiktoken and encoding/is_chatml match expectations
        if ((strat as any).type === 'tiktoken') {
            const t = strat as { type: 'tiktoken'; tiktoken_encoding_name?: string; is_chatml_model?: boolean };
            assertEquals(t.tiktoken_encoding_name, expectedEncoding, `${key} should use ${expectedEncoding}`);
            assertEquals(t.is_chatml_model, expectedIsChatML, `${key} is_chatml_model mismatch`);
        } else {
            // For any non-tiktoken entries, this is a failure for these models
            assert(false, `${key} should use tiktoken strategy`);
        }
    }
});

// RED: INTERNAL_MODEL_MAP exposes correct windows for 4.1 and 4o families
Deno.test("[Provider-Specific] openai: INTERNAL_MODEL_MAP sets expected provider_max_input_tokens for 4.1 and 4o", () => {
  const expectations: Array<[string, number]> = [
    ["openai-gpt-4.1", 1_047_576],
    ["openai-gpt-4.1-mini", 1_047_576],
    ["openai-gpt-4.1-nano", 1_047_576],
    ["openai-gpt-4o", 128_000],
    ["openai-gpt-4o-mini", 128_000],
  ];

  for (const [key, expectedMaxIn] of expectations) {
    const cfg = INTERNAL_MODEL_MAP.get(key);
    assertExists(cfg, `Missing INTERNAL_MODEL_MAP entry for ${key}`);
    const pmi = (cfg as Partial<AiModelExtendedConfig>).provider_max_input_tokens;
    assertExists(pmi, `provider_max_input_tokens missing for ${key}`);
    assertEquals(pmi, expectedMaxIn, `${key} should have provider_max_input_tokens = ${expectedMaxIn}`);
  }
});
