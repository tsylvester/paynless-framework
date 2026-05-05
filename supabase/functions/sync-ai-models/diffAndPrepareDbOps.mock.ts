import type { AiModelExtendedConfig, FinalAppModelConfig } from "../_shared/types.ts";
import type { Json } from "../types_db.ts";
import { DbAiProvider } from "./sync-ai-models.interface.ts";
import type { ModelCostProvenance } from "./config_assembler.interface.ts";

export function createTestConfig(apiIdentifier: string): AiModelExtendedConfig {
    return {
        api_identifier: apiIdentifier,
        input_token_cost_rate: 0.00001,
        output_token_cost_rate: 0.00002,
        context_window_tokens: 8192,
        hard_cap_output_tokens: 4096,
        provider_max_input_tokens: 8192,
        provider_max_output_tokens: 4096,
        tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 4 },
    };
}

export function createFinalAppModelConfig(
    apiIdentifier: string,
    name: string,
    overrides: Partial<AiModelExtendedConfig> = {},
): FinalAppModelConfig {
    return {
        api_identifier: apiIdentifier,
        name: name,
        description: `Description for ${name}`,
        config: { ...createTestConfig(apiIdentifier), ...overrides },
    };
}

export function provenanceNone(): ModelCostProvenance {
    return { input_source: "none", output_source: "none" };
}

export function provenanceStaticMap(): ModelCostProvenance {
    return { input_source: "static_map", output_source: "static_map" };
}

export function provenanceApi(): ModelCostProvenance {
    return { input_source: "api", output_source: "api" };
}

export function singleCostProvenanceMap(
    apiIdentifier: string,
    provenance: ModelCostProvenance,
): Map<string, ModelCostProvenance> {
    const costProvenanceByApiId: Map<string, ModelCostProvenance> = new Map();
    costProvenanceByApiId.set(apiIdentifier, provenance);
    return costProvenanceByApiId;
}

/** One provenance entry per assembled model — matches sync pipeline wiring after ConfigAssembler. */
export function costProvenanceForAssembledConfigs(
    assembledConfigs: readonly FinalAppModelConfig[],
    provenance: ModelCostProvenance,
): Map<string, ModelCostProvenance> {
    const costProvenanceByApiId: Map<string, ModelCostProvenance> = new Map();
    for (const model of assembledConfigs) {
        costProvenanceByApiId.set(model.api_identifier, provenance);
    }
    return costProvenanceByApiId;
}

export function emptyCostProvenanceMap(): Map<string, ModelCostProvenance> {
    return new Map();
}

export function dbRowWithTier(params: {
    id: string;
    api_identifier: string;
    name: string;
    description: string | null;
    is_active: boolean;
    provider: string;
    config: Json;
    is_enabled: boolean;
    min_plan_tier_level: number;
}): DbAiProvider & { is_enabled: boolean; min_plan_tier_level: number } {
    return {
        id: params.id,
        api_identifier: params.api_identifier,
        name: params.name,
        description: params.description,
        is_active: params.is_active,
        provider: params.provider,
        config: params.config,
        is_enabled: params.is_enabled,
        min_plan_tier_level: params.min_plan_tier_level,
    };
}
