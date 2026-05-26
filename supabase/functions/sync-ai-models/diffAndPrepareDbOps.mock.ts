import type { AiModelExtendedConfig, FinalAppModelConfig } from "../_shared/types.ts";
import type { Json } from "../types_db.ts";
import type { DbAiProvider, AiProvidersSyncInsert, AiProvidersSyncUpdate, ModelsToUpdate } from "./sync-ai-models.interface.ts";
import type { ModelCostProvenance } from "./config_assembler.interface.ts";
import { DbOpLists, DbOpResult } from "./sync-ai-models.interface.ts";

export function mockAiModelExtendedConfig(
    overrides: Partial<AiModelExtendedConfig> = {},
): AiModelExtendedConfig {
    return {
        api_identifier: "mock-model",
        input_token_cost_rate: 3,
        output_token_cost_rate: 3,
        tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 4 },
        context_window_tokens: 8192,
        hard_cap_output_tokens: 4096,
        provider_max_input_tokens: 8192,
        provider_max_output_tokens: 4096,
        ...overrides,
    };
}

export function mockFinalAppModelConfig(
    overrides: Partial<Omit<FinalAppModelConfig, "config">> & { config?: Partial<AiModelExtendedConfig> } = {},
): FinalAppModelConfig {
    const { config: configOverrides, ...topLevel } = overrides;
    const apiIdentifier: string = topLevel.api_identifier ?? "mock-model";
    return {
        api_identifier: apiIdentifier,
        name: "Mock Model",
        description: "Mock model description",
        ...topLevel,
        config: mockAiModelExtendedConfig({ api_identifier: apiIdentifier, ...configOverrides }),
    };
}

export function mockDbAiProvider(overrides: Partial<DbAiProvider> = {}): DbAiProvider {
    const defaultConfig: Json = {
        api_identifier: "mock-model",
        input_token_cost_rate: 3,
        output_token_cost_rate: 3,
        tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 4 },
        context_window_tokens: 8192,
        hard_cap_output_tokens: 4096,
        provider_max_input_tokens: 8192,
        provider_max_output_tokens: 4096,
    };
    return {
        id: "mock-db-id",
        api_identifier: "mock-model",
        name: "Mock Model",
        description: "Mock model description",
        is_active: true,
        is_enabled: true,
        is_default_embedding: false,
        is_default_generation: false,
        provider: "mock-provider",
        config: defaultConfig,
        min_plan_tier_level: 0,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        ...overrides,
    };
}

export function mockModelCostProvenance(
    overrides: Partial<ModelCostProvenance> = {},
): ModelCostProvenance {
    return {
        input_source: "static_map",
        output_source: "static_map",
        ...overrides,
    };
}

export function mockCostProvenanceMap(
    entries: [string, ModelCostProvenance][] = [],
): Map<string, ModelCostProvenance> {
    return new Map(entries);
}

export function mockAiProvidersSyncInsert(
    overrides: Partial<AiProvidersSyncInsert> = {},
): AiProvidersSyncInsert {
    return {
        api_identifier: "mock-model",
        name: "Mock Model",
        description: "Mock model description",
        provider: "mock-provider",
        config: null,
        is_enabled: true,
        min_plan_tier_level: 0,
        ...overrides,
    };
}

export function mockModelsToUpdate(
    overrides: { id?: string; changes?: AiProvidersSyncUpdate } = {},
): ModelsToUpdate {
    return {
        id: "mock-db-id",
        changes: {},
        ...overrides,
    };
}

export function mockDbOpLists(overrides: Partial<DbOpLists> = {}): DbOpLists {
    return {
        modelsToInsert: [],
        modelsToUpdate: [],
        modelsToDeactivate: [],
        ...overrides,
    };
}

export function mockDbOpResult(overrides: Partial<DbOpResult> = {}): DbOpResult {
    return {
        inserted: 0,
        updated: 0,
        deactivated: 0,
        ...overrides,
    };
}
