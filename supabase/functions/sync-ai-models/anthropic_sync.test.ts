// supabase/functions/sync-ai-models/anthropic_sync.test.ts
import { testSyncContract, type MockProviderData } from "./sync_test_contract.ts";
import { syncAnthropicModels } from "./anthropic_sync.ts";
import { type DbAiProvider } from "./index.ts";
import type { AiModelExtendedConfig } from "../_shared/types.ts";
import { type AssembledModelConfig } from "./config_assembler.ts";
import { isJson } from "../_shared/utils/type_guards.ts";
import { assert } from "jsr:@std/assert@0.225.3";

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
const assembledClaudeOpus: AssembledModelConfig = { api_identifier: `claude-3-opus-20240229`, name: "Claude 3 Opus", description: "A solid model.", config: assembledClaudeOpusConfig };

const assembledClaudeNewConfig = createTestConfig('claude-new-model');
assert(isJson(assembledClaudeNewConfig), "assembledClaudeNewConfig must be valid JSON");
const assembledClaudeNew: AssembledModelConfig = { api_identifier: `claude-new-model`, name: "Claude New", description: "A new model.", config: assembledClaudeNewConfig };

const assembledClaudeUpdatedConfig = createTestConfig('claude-3-opus-20240229', { output_token_cost_rate: 80.0 / 1_000_000 });
assert(isJson(assembledClaudeUpdatedConfig), "assembledClaudeUpdatedConfig must be valid JSON");
const assembledClaudeUpdated: AssembledModelConfig = { api_identifier: `claude-3-opus-20240229`, name: "Claude 3 Opus v2", description: "An updated model.", config: assembledClaudeUpdatedConfig };

const assembledClaudeReactivateConfig = createTestConfig('claude-reactivate');
assert(isJson(assembledClaudeReactivateConfig), "assembledClaudeReactivateConfig must be valid JSON");
const assembledClaudeReactivate: AssembledModelConfig = { api_identifier: `claude-reactivate`, name: "Reactivated", description: "It is back.", config: assembledClaudeReactivateConfig };

const dbClaudeOpusConfig = createTestConfig('claude-3-opus-20240229');
assert(isJson(dbClaudeOpusConfig), "dbClaudeOpusConfig must be valid JSON");
const dbClaudeOpus: DbAiProvider = {
    id: 'db-id-claude-opus',
    api_identifier: `claude-3-opus-20240229`,
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
    api_identifier: `claude-stale`,
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
    api_identifier: `claude-reactivate`,
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
