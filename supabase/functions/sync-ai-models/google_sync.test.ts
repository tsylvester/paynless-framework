// supabase/functions/sync-ai-models/google_sync.test.ts
import { testSyncContract, type MockProviderData } from "./sync_test_contract.ts";
import { syncGoogleModels, INTERNAL_MODEL_MAP } from "./google_sync.ts";
import { type DbAiProvider } from "./index.ts";
import type { AiModelExtendedConfig, FinalAppModelConfig } from "../_shared/types.ts";
import { isJson } from "../_shared/utils/type_guards.ts";
import { assert, assertEquals } from "jsr:@std/assert@0.225.3";
import { AiModelExtendedConfigSchema } from "../chat/zodSchema.ts";

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
const assembledGeminiPro: FinalAppModelConfig = { api_identifier: `google-gemini-1.5-pro-latest`, name: "Gemini 1.5 Pro", description: "A solid model.", config: assembledGeminiProConfig };

const assembledGeminiNewConfig = createTestConfig('gemini-new');
assert(isJson(assembledGeminiNewConfig), "assembledGeminiNewConfig must be valid JSON");
const assembledGeminiNew: FinalAppModelConfig = { api_identifier: `google-gemini-new`, name: "Gemini New", description: "A new model.", config: assembledGeminiNewConfig };

const assembledGeminiUpdatedConfig = createTestConfig('gemini-1.5-pro-latest', { output_token_cost_rate: 11.0 / 1_000_000 });
assert(isJson(assembledGeminiUpdatedConfig), "assembledGeminiUpdatedConfig must be valid JSON");
const assembledGeminiUpdated: FinalAppModelConfig = { api_identifier: `google-gemini-1.5-pro-latest`, name: "Gemini 1.5 Pro v2", description: "An updated model.", config: assembledGeminiUpdatedConfig };

const assembledGeminiReactivateConfig = createTestConfig('gemini-reactivate');
assert(isJson(assembledGeminiReactivateConfig), "assembledGeminiReactivateConfig must be valid JSON");
const assembledGeminiReactivate: FinalAppModelConfig = { api_identifier: `google-gemini-reactivate`, name: "Reactivated", description: "It is back.", config: assembledGeminiReactivateConfig };

const dbGeminiProConfig = createTestConfig('gemini-1.5-pro-latest');
assert(isJson(dbGeminiProConfig), "dbGeminiProConfig must be valid JSON");
const dbGeminiPro: DbAiProvider = {
    id: 'db-id-gemini-pro',
    api_identifier: `google-gemini-1.5-pro-latest`,
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
    api_identifier: `google-gemini-stale`,
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
    api_identifier: `google-gemini-reactivate`,
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
