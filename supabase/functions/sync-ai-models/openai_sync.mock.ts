/** Snapshot of `api_identifier` values from `supabase/seed.sql` rows where provider is `openai` (see checklist: sync-ai-models OpenAI internal map). */

import type { AiModelExtendedConfig, FinalAppModelConfig } from "../_shared/types.ts";
import { DbAiProvider } from "./sync-ai-models.interface.ts";
import type { MockProviderData } from "./sync_test_contract.ts";
import { isJson } from "../_shared/utils/type_guards.ts";
import { assert } from "jsr:@std/assert@0.225.3";
import { mockDbAiProvider } from "./diffAndPrepareDbOps.mock.ts";

/**
 * Checklist `Fix Model Costs and Pricing` — official headline USD per 1M tokens (input, output)
 * for Tier-3 `INTERNAL_MODEL_MAP` resolution via longest-prefix match on `api_identifier`.
 */
export const openaiRates: ReadonlyArray<readonly [string, number, number]> = [
    ["openai-gpt-5", 1.25, 10.0],
    ["openai-gpt-5.2", 1.75, 14.0],
    ["openai-gpt-5-mini", 1.0, 5.0],
    ["openai-gpt-5-nano", 0.5, 2.0],
];

export const openaiIdentifiers: readonly string[] = [
    'openai-chatgpt-4o-latest',
    'openai-chatgpt-image-latest',
    'openai-gpt-3.5-turbo',
    'openai-gpt-3.5-turbo-0125',
    'openai-gpt-3.5-turbo-1106',
    'openai-gpt-3.5-turbo-16k',
    'openai-gpt-3.5-turbo-instruct',
    'openai-gpt-3.5-turbo-instruct-0914',
    'openai-gpt-3.5-turbo-test',
    'openai-gpt-4',
    'openai-gpt-4-0125-preview',
    'openai-gpt-4-0613',
    'openai-gpt-4.1',
    'openai-gpt-4-1106-preview',
    'openai-gpt-4.1-2025-04-14',
    'openai-gpt-4.1-mini',
    'openai-gpt-4.1-mini-2025-04-14',
    'openai-gpt-4.1-nano',
    'openai-gpt-4.1-nano-2025-04-14',
    'openai-gpt-4.5-preview',
    'openai-gpt-4.5-preview-2025-02-27',
    'openai-gpt-4-costly-test',
    'openai-gpt-4o',
    'openai-gpt-4o-2024-05-13',
    'openai-gpt-4o-2024-08-06',
    'openai-gpt-4o-2024-11-20',
    'openai-gpt-4o-audio-preview',
    'openai-gpt-4o-audio-preview-2024-10-01',
    'openai-gpt-4o-audio-preview-2024-12-17',
    'openai-gpt-4o-audio-preview-2025-06-03',
    'openai-gpt-4o-mini',
    'openai-gpt-4o-mini-2024-07-18',
    'openai-gpt-4o-mini-audio-preview',
    'openai-gpt-4o-mini-audio-preview-2024-12-17',
    'openai-gpt-4o-mini-realtime-preview',
    'openai-gpt-4o-mini-realtime-preview-2024-12-17',
    'openai-gpt-4o-mini-search-preview',
    'openai-gpt-4o-mini-search-preview-2025-03-11',
    'openai-gpt-4o-mini-transcribe',
    'openai-gpt-4o-mini-transcribe-2025-03-20',
    'openai-gpt-4o-mini-transcribe-2025-12-15',
    'openai-gpt-4o-mini-tts',
    'openai-gpt-4o-mini-tts-2025-03-20',
    'openai-gpt-4o-mini-tts-2025-12-15',
    'openai-gpt-4o-realtime-preview',
    'openai-gpt-4o-realtime-preview-2024-10-01',
    'openai-gpt-4o-realtime-preview-2024-12-17',
    'openai-gpt-4o-realtime-preview-2025-06-03',
    'openai-gpt-4o-search-preview',
    'openai-gpt-4o-search-preview-2025-03-11',
    'openai-gpt-4o-transcribe',
    'openai-gpt-4o-transcribe-diarize',
    'openai-gpt-4-turbo',
    'openai-gpt-4-turbo-2024-04-09',
    'openai-gpt-4-turbo-preview',
    'openai-gpt-5',
    'openai-gpt-5.1',
    'openai-gpt-5.1-2025-11-13',
    'openai-gpt-5.1-chat-latest',
    'openai-gpt-5.1-codex',
    'openai-gpt-5.1-codex-max',
    'openai-gpt-5.1-codex-mini',
    'openai-gpt-5.2',
    'openai-gpt-5-2025-08-07',
    'openai-gpt-5.2-2025-12-11',
    'openai-gpt-5.2-chat-latest',
    'openai-gpt-5.2-codex',
    'openai-gpt-5.2-pro',
    'openai-gpt-5.2-pro-2025-12-11',
    'openai-gpt-5.3-chat-latest',
    'openai-gpt-5.3-codex',
    'openai-gpt-5.4',
    'openai-gpt-5.4-2026-03-05',
    'openai-gpt-5.4-mini',
    'openai-gpt-5.4-mini-2026-03-17',
    'openai-gpt-5.4-nano',
    'openai-gpt-5.4-nano-2026-03-17',
    'openai-gpt-5.4-pro',
    'openai-gpt-5.4-pro-2026-03-05',
    'openai-gpt-5-chat-latest',
    'openai-gpt-5-codex',
    'openai-gpt-5-mini',
    'openai-gpt-5-mini-2025-08-07',
    'openai-gpt-5-nano',
    'openai-gpt-5-nano-2025-08-07',
    'openai-gpt-5-pro',
    'openai-gpt-5-pro-2025-10-06',
    'openai-gpt-5-search-api',
    'openai-gpt-5-search-api-2025-10-14',
    'openai-gpt-audio',
    'openai-gpt-audio-1.5',
    'openai-gpt-audio-2025-08-28',
    'openai-gpt-audio-mini',
    'openai-gpt-audio-mini-2025-10-06',
    'openai-gpt-audio-mini-2025-12-15',
    'openai-gpt-image-1',
    'openai-gpt-image-1.5',
    'openai-gpt-image-1-mini',
    'openai-gpt-realtime',
    'openai-gpt-realtime-1.5',
    'openai-gpt-realtime-2025-08-28',
    'openai-gpt-realtime-mini',
    'openai-gpt-realtime-mini-2025-10-06',
    'openai-gpt-realtime-mini-2025-12-15',
    'openai-text-embedding-3-large',
    'openai-text-embedding-3-small',
    'openai-text-embedding-ada-002',
];

// --- Test Data Factory ---

const PROVIDER_NAME = 'openai';

export const createTestConfig = (apiIdentifier: string, overrides: Partial<AiModelExtendedConfig> = {}): AiModelExtendedConfig => ({
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
const dbGpt4: DbAiProvider = mockDbAiProvider({
    id: 'db-id-gpt-4',
    api_identifier: `gpt-4-turbo`,
    name: 'GPT-4 Turbo',
    description: 'A solid model.',
    is_active: true,
    provider: PROVIDER_NAME,
    config: dbGpt4Config,
});

const dbStaleConfig = createTestConfig('gpt-stale');
assert(isJson(dbStaleConfig), "dbStaleConfig must be valid JSON");
const dbStale: DbAiProvider = mockDbAiProvider({
    id: 'db-id-stale',
    api_identifier: `gpt-stale`,
    name: 'Stale Model',
    description: 'This should be deactivated.',
    is_active: true,
    provider: PROVIDER_NAME,
    config: dbStaleConfig
});

const dbInactiveConfig = createTestConfig('gpt-reactivate');
assert(isJson(dbInactiveConfig), "dbInactiveConfig must be valid JSON");
const dbInactive: DbAiProvider = mockDbAiProvider({
    id: 'db-id-inactive',
    api_identifier: `gpt-reactivate`,
    name: 'Reactivated',
    description: 'It is back.',
    is_active: false,
    provider: PROVIDER_NAME,
    config: dbInactiveConfig
});

export const mockOpenAIData: MockProviderData = {
    apiModels: [assembledGpt4],
    dbModel: dbGpt4,
    staleDbModel: dbStale,
    inactiveDbModel: dbInactive,
    reactivateApiModel: assembledGptReactivate,
    newApiModel: assembledGptNew,
    updatedApiModel: assembledGptUpdated
};
