import type {
  AiModelExtendedConfig,
  FinalAppModelConfig,
  ILogger,
  ProviderModelInfo,
} from '../_shared/types.ts';
import type { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import type { TokenizationStrategySchema } from '../chat/zodSchema.ts';

export type TokenizationStrategy = z.infer<typeof TokenizationStrategySchema>;

// --- Interfaces & Types for the Assembler ---

/**
 * Defines the sources of configuration data the assembler will use.
 * Each source is optional, allowing for a flexible cascade.
 */
export interface ConfigDataSource {
  /** Tier 1: Models directly from the provider's API, potentially with some config data. */
  apiModels: ProviderModelInfo[];
  /** Tier 2: A function that returns a map of model capabilities from an external source. */
  externalCapabilities?: () => Promise<Map<string, Partial<AiModelExtendedConfig>>>;
  /** Tier 3: A hardcoded map of model configurations as a failsafe. */
  internalModelMap?: Map<string, Partial<AiModelExtendedConfig>>;
  /** A logger instance for detailed output. */
  logger: ILogger;
}

/** Trusted tier for a single input or output rate field (ephemeral; not stored on the model row). */
export type TokenCostFieldSource = 'api' | 'static_map' | 'none';

/** Per-field provenance for billing rates from assembly, consumed by diff. */
export interface ModelCostProvenance {
  input_source: TokenCostFieldSource;
  output_source: TokenCostFieldSource;
}

/** Return value of `ConfigAssembler.assemble` once extended with provenance. */
export interface AssembleOutcome {
  models: FinalAppModelConfig[];
  costProvenance: Map<string, ModelCostProvenance>;
}
