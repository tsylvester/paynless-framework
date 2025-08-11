// supabase/functions/sync-ai-models/anthropic_sync.test.ts
import { testSyncContract, type MockProviderData } from "./sync_test_contract.ts";
import { syncAnthropicModels, INTERNAL_MODEL_MAP } from "./anthropic_sync.ts";
import { type DbAiProvider } from "./index.ts";
import type { AiModelExtendedConfig, FinalAppModelConfig } from "../_shared/types.ts";
import { isJson } from "../_shared/utils/type_guards.ts";
import { assert, assertEquals } from "jsr:@std/assert@0.225.3";
import { AiModelExtendedConfigSchema } from "../chat/zodSchema.ts";

const PROVIDER_NAME = 'anthropic';

// --- Test Data Factory ---

const createTestConfig = (apiIdentifier: string, overrides: Partial<AiModelExtendedConfig> = {}): AiModelExtendedConfig => ({
    api_identifier: apiIdentifier,
    input_token_cost_rate: 15.0 / 1_000_000,
    output_token_cost_rate: 75.0 / 1_000_000,
    context_window_tokens: 200000,
    hard_cap_output_tokens: 4096,
    provider_max_input_tokens: 200000,
    provider_max_output_tokens: 4096,
    tokenization_strategy: { type: 'anthropic_tokenizer', model: apiIdentifier },
    ...overrides
});

const assembledClaudeOpusConfig = createTestConfig('claude-3-opus-20240229');
assert(isJson(assembledClaudeOpusConfig), "assembledClaudeOpusConfig must be valid JSON");
const assembledClaudeOpus: FinalAppModelConfig = { api_identifier: `anthropic-claude-3-opus-20240229`, name: "Claude 3 Opus", description: "A solid model.", config: assembledClaudeOpusConfig };

const assembledClaudeNewConfig = createTestConfig('claude-new-model');
assert(isJson(assembledClaudeNewConfig), "assembledClaudeNewConfig must be valid JSON");
const assembledClaudeNew: FinalAppModelConfig = { api_identifier: `anthropic-claude-new-model`, name: "Claude New", description: "A new model.", config: assembledClaudeNewConfig };

const assembledClaudeUpdatedConfig = createTestConfig('claude-3-opus-20240229', { output_token_cost_rate: 80.0 / 1_000_000 });
assert(isJson(assembledClaudeUpdatedConfig), "assembledClaudeUpdatedConfig must be valid JSON");
const assembledClaudeUpdated: FinalAppModelConfig = { api_identifier: `anthropic-claude-3-opus-20240229`, name: "Claude 3 Opus v2", description: "An updated model.", config: assembledClaudeUpdatedConfig };

const assembledClaudeReactivateConfig = createTestConfig('claude-reactivate');
assert(isJson(assembledClaudeReactivateConfig), "assembledClaudeReactivateConfig must be valid JSON");
const assembledClaudeReactivate: FinalAppModelConfig = { api_identifier: `anthropic-claude-reactivate`, name: "Reactivated", description: "It is back.", config: assembledClaudeReactivateConfig };

const dbClaudeOpusConfig = createTestConfig('claude-3-opus-20240229');
assert(isJson(dbClaudeOpusConfig), "dbClaudeOpusConfig must be valid JSON");
const dbClaudeOpus: DbAiProvider = {
    id: 'db-id-claude-opus',
    api_identifier: `anthropic-claude-3-opus-20240229`,
    name: 'Claude 3 Opus',
    description: 'A solid model.',
    is_active: true,
    provider: PROVIDER_NAME,
    config: dbClaudeOpusConfig,
};

const dbStaleConfig = createTestConfig('claude-stale');
assert(isJson(dbStaleConfig), "dbStaleConfig must be valid JSON");
const dbStale: DbAiProvider = {
    id: 'db-id-stale',
    api_identifier: `anthropic-claude-stale`,
    name: 'Stale Model',
    description: 'This should be deactivated.',
    is_active: true,
    provider: PROVIDER_NAME,
    config: dbStaleConfig
};

const dbInactiveConfig = createTestConfig('claude-reactivate');
assert(isJson(dbInactiveConfig), "dbInactiveConfig must be valid JSON");
const dbInactive: DbAiProvider = {
    id: 'db-id-inactive',
    api_identifier: `anthropic-claude-reactivate`,
    name: 'Reactivated',
    description: 'It is back.',
    is_active: false,
    provider: PROVIDER_NAME,
    config: dbInactiveConfig
};

const mockAnthropicData: MockProviderData = {
    apiModels: [assembledClaudeOpus],
    dbModel: dbClaudeOpus,
    staleDbModel: dbStale,
    inactiveDbModel: dbInactive,
    reactivateApiModel: assembledClaudeReactivate,
    newApiModel: assembledClaudeNew,
    updatedApiModel: assembledClaudeUpdated
};

// --- Test Suite ---

Deno.test("syncAnthropicModels", {
    sanitizeOps: false,
    sanitizeResources: false,
}, async (t) => {
    // Run the standardized test contract
    await testSyncContract(t, syncAnthropicModels, mockAnthropicData, PROVIDER_NAME);

    // No provider-specific tests are needed for Anthropic at this time.
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
