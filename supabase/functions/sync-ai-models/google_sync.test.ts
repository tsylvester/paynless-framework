// supabase/functions/sync-ai-models/google_sync.test.ts
import { testSyncContract, type MockProviderData } from "./sync_test_contract.ts";
import { syncGoogleModels } from "./google_sync.ts";
import { type DbAiProvider } from "./index.ts";
import type { AiModelExtendedConfig } from "../_shared/types.ts";
import { type AssembledModelConfig } from "./config_assembler.ts";
import { isJson } from "../_shared/utils/type_guards.ts";
import { assert } from "jsr:@std/assert@0.225.3";

const PROVIDER_NAME = 'google';

// --- Test Data Factory ---

const createTestConfig = (apiIdentifier: string, overrides: Partial<AiModelExtendedConfig> = {}): AiModelExtendedConfig => ({
    api_identifier: apiIdentifier,
    input_token_cost_rate: 3.5 / 1_000_000,
    output_token_cost_rate: 10.5 / 1_000_000,
    context_window_tokens: 1048576,
    hard_cap_output_tokens: 8192,
    provider_max_input_tokens: 1048576,
    provider_max_output_tokens: 8192,
    tokenization_strategy: { type: 'google_gemini_tokenizer' },
    ...overrides
});

const assembledGeminiProConfig = createTestConfig('gemini-1.5-pro-latest');
assert(isJson(assembledGeminiProConfig), "assembledGeminiProConfig must be valid JSON");
const assembledGeminiPro: AssembledModelConfig = { api_identifier: `models/gemini-1.5-pro-latest`, name: "Gemini 1.5 Pro", description: "A solid model.", config: assembledGeminiProConfig };

const assembledGeminiNewConfig = createTestConfig('gemini-new');
assert(isJson(assembledGeminiNewConfig), "assembledGeminiNewConfig must be valid JSON");
const assembledGeminiNew: AssembledModelConfig = { api_identifier: `models/gemini-new`, name: "Gemini New", description: "A new model.", config: assembledGeminiNewConfig };

const assembledGeminiUpdatedConfig = createTestConfig('gemini-1.5-pro-latest', { output_token_cost_rate: 11.0 / 1_000_000 });
assert(isJson(assembledGeminiUpdatedConfig), "assembledGeminiUpdatedConfig must be valid JSON");
const assembledGeminiUpdated: AssembledModelConfig = { api_identifier: `models/gemini-1.5-pro-latest`, name: "Gemini 1.5 Pro v2", description: "An updated model.", config: assembledGeminiUpdatedConfig };

const assembledGeminiReactivateConfig = createTestConfig('gemini-reactivate');
assert(isJson(assembledGeminiReactivateConfig), "assembledGeminiReactivateConfig must be valid JSON");
const assembledGeminiReactivate: AssembledModelConfig = { api_identifier: `models/gemini-reactivate`, name: "Reactivated", description: "It is back.", config: assembledGeminiReactivateConfig };

const dbGeminiProConfig = createTestConfig('gemini-1.5-pro-latest');
assert(isJson(dbGeminiProConfig), "dbGeminiProConfig must be valid JSON");
const dbGeminiPro: DbAiProvider = {
    id: 'db-id-gemini-pro',
    api_identifier: `models/gemini-1.5-pro-latest`,
    name: 'Gemini 1.5 Pro',
    description: 'A solid model.',
    is_active: true,
    provider: PROVIDER_NAME,
    config: dbGeminiProConfig,
};

const dbStaleConfig = createTestConfig('gemini-stale');
assert(isJson(dbStaleConfig), "dbStaleConfig must be valid JSON");
const dbStale: DbAiProvider = {
    id: 'db-id-stale',
    api_identifier: `models/gemini-stale`,
    name: 'Stale Model',
    description: 'This should be deactivated.',
    is_active: true,
    provider: PROVIDER_NAME,
    config: dbStaleConfig
};

const dbInactiveConfig = createTestConfig('gemini-reactivate');
assert(isJson(dbInactiveConfig), "dbInactiveConfig must be valid JSON");
const dbInactive: DbAiProvider = {
    id: 'db-id-inactive',
    api_identifier: `models/gemini-reactivate`,
    name: 'Reactivated',
    description: 'It is back.',
    is_active: false,
    provider: PROVIDER_NAME,
    config: dbInactiveConfig
};

const mockGoogleData: MockProviderData = {
    apiModels: [assembledGeminiPro],
    dbModel: dbGeminiPro,
    staleDbModel: dbStale,
    inactiveDbModel: dbInactive,
    reactivateApiModel: assembledGeminiReactivate,
    newApiModel: assembledGeminiNew,
    updatedApiModel: assembledGeminiUpdated
};


// --- Test Suite ---

Deno.test("syncGoogleModels", {
    sanitizeOps: false,
    sanitizeResources: false,
}, async (t) => {
    // Run the standardized test contract
    await testSyncContract(t, syncGoogleModels, mockGoogleData, PROVIDER_NAME);

    // No provider-specific tests are needed for Google at this time.
});
