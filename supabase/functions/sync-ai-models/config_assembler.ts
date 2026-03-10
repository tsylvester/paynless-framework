// supabase/functions/sync-ai-models/config_assembler.ts
import type { 
  AiModelExtendedConfig, 
  ProviderModelInfo,
  FinalAppModelConfig,
} from '../_shared/types.ts';
import { ILogger } from '../_shared/types.ts';
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { AiModelExtendedConfigSchema, TokenizationStrategySchema } from '../chat/zodSchema.ts';

type TokenizationStrategy = z.infer<typeof TokenizationStrategySchema>;

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

// --- Main Assembler Logic ---

/**
 * A utility class that orchestrates the assembly of AI model configurations
 * from multiple data sources using a hierarchical, two-pass system.
 */
export class ConfigAssembler {
  private sources: ConfigDataSource;
  private logger: ILogger;

  constructor(sources: ConfigDataSource) {
    this.sources = sources;
    this.logger = sources.logger;
  }

  /**
   * Executes the full assembly process using a robust, single-pass, top-down strategy.
   * @returns A promise that resolves to a list of fully and correctly configured models.
   */
  public async assemble(): Promise<FinalAppModelConfig[]> {
    this.logger.info('[ConfigAssembler] Starting top-down configuration assembly...');
    const finalModels: FinalAppModelConfig[] = [];
    const externalCaps = await this.sources.externalCapabilities?.() ?? new Map();
    const failsafeStrategy: TokenizationStrategy = { type: 'rough_char_count', chars_per_token_ratio: 4 };

    for (const apiModel of this.sources.apiModels) {
      // 1. Establish a complete, valid baseline config using dynamic defaults.
      // Use all API models (with any provided configs) as cohort context and the current id
      const baseConfig = this.calculateDynamicDefaults(this.sources.apiModels, 1, apiModel.api_identifier);
      
      // 2. Define all partial config sources in DESCENDING order of priority.
      const configSources: (Partial<AiModelExtendedConfig> | undefined)[] = [
        apiModel.config,                                      // Tier 1: API Data (Highest Priority)
        externalCaps.get(apiModel.api_identifier),            // Tier 2: External Capabilities
        this.sources.internalModelMap?.get(apiModel.api_identifier), // Tier 3: Internal Static Map
        baseConfig,                                           // Tier 4: Failsafe Defaults (Lowest Priority)
      ];
      
      const definedSources = configSources.filter((s): s is Partial<AiModelExtendedConfig> => s !== undefined);
      
      // 3. Intelligently find the first valid tokenization strategy, atomistically.
      let finalStrategy: TokenizationStrategy | undefined;
      for (const source of definedSources) {
          if (source.tokenization_strategy) {
              const validation = TokenizationStrategySchema.safeParse(source.tokenization_strategy);
              if (validation.success) {
                  finalStrategy = validation.data;
                  break; // Found the highest-priority valid strategy
              }
          }
      }
      if (!finalStrategy) {
        this.logger.warn(`[ConfigAssembler] No valid tokenization strategy found for ${apiModel.api_identifier}. Falling back to failsafe.`);
        finalStrategy = failsafeStrategy;
      }
      
      // 4. Merge all sources, with higher priority sources overwriting lower ones.
      const mergedConfig = definedSources.reverse().reduce(
        (acc, source) => ({ ...acc, ...source }),
        baseConfig
      );

      // 5. Overwrite with the atomistically-selected valid strategy.
      mergedConfig.tokenization_strategy = finalStrategy;
      
      // 6. Perform one final, STRICT validation. This will throw on any invalid structure.
      mergedConfig.api_identifier = apiModel.api_identifier;
      const validatedConfig = AiModelExtendedConfigSchema.parse(mergedConfig);

      // 7. If validation succeeds, construct and push the final application-ready object.
      finalModels.push({
        api_identifier: apiModel.api_identifier,
        name: apiModel.name,
        description: apiModel.description ?? '',
        config: validatedConfig,
      });
    }
    
    this.logger.info(`[ConfigAssembler] Assembly complete. Total models configured: ${finalModels.length}`);
    return finalModels;
  }

  /**
   * Calculates the dynamic default configuration based on the set of fully configured models.
   */
  private calculateDynamicDefaults(
    configuredModels: (ProviderModelInfo | FinalAppModelConfig)[],
    newModelCount: number,
    currentApiIdentifier?: string,
  ): Partial<AiModelExtendedConfig> {
    this.logger.info(`[ConfigAssembler] Calculating dynamic defaults based on ${configuredModels.length} configured models for ${newModelCount} new models...`);
    
    // Absolute failsafe values, used if no configured models are available.
    // Updated for 2026: Using rational defaults based on mid-to-high tier models (e.g. GPT-4o/Opus class)
    // to prevent dangerous under-estimation of costs or capabilities for new models.
    const DEFAULTS: AiModelExtendedConfig = {
        api_identifier: 'default',
        input_token_cost_rate: 15, // Rational default (~$15/1M, high-end safety margin)
        output_token_cost_rate: 75, // Rational default (~$75/1M, high-end safety margin)
        context_window_tokens: 128000, // Modern standard baseline
        hard_cap_output_tokens: 65536,
        provider_max_input_tokens: 128000,
        provider_max_output_tokens: 65536,
        tokenization_strategy: { type: 'rough_char_count', chars_per_token_ratio: 4 }
    };

    // --- Start of Fix ---
    // 1. First, create a clean list of only models that have a full configuration object.
    const modelsWithConfigs = configuredModels.filter(
      (m): m is FinalAppModelConfig => m.config !== undefined
    );

    if (modelsWithConfigs.length === 0) {
        this.logger.warn('[ConfigAssembler] No fully configured models found. Applying minimal adaptive floors.');
        const emptyConfiguredModels: FinalAppModelConfig[] = [];
        const floors = this.getAdaptiveProviderFloor(currentApiIdentifier, emptyConfiguredModels);
        // If floors are available for this provider/id, use them to set realistic windows; otherwise, use generic defaults
        const flooredDefaults: Partial<AiModelExtendedConfig> = floors ? {
          input_token_cost_rate: DEFAULTS.input_token_cost_rate,
          output_token_cost_rate: DEFAULTS.output_token_cost_rate,
          context_window_tokens: floors.window,
          hard_cap_output_tokens: floors.outputCap,
          provider_max_input_tokens: floors.window,
          provider_max_output_tokens: floors.outputCap,
          tokenization_strategy: DEFAULTS.tokenization_strategy,
        } : DEFAULTS;
        return flooredDefaults;
    }

    // 2. Safely calculate high-water marks by filtering out nulls before calling Math.max.
    const inputCosts = modelsWithConfigs
      .map(m => m.config.input_token_cost_rate)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const outputCosts = modelsWithConfigs
      .map(m => m.config.output_token_cost_rate)
      .filter((v): v is number => typeof v === 'number' && v > 0);

    const highWaterMarkInput = inputCosts.length > 0 ? Math.max(...inputCosts) : DEFAULTS.input_token_cost_rate;
    const highWaterMarkOutput = outputCosts.length > 0 ? Math.max(...outputCosts) : DEFAULTS.output_token_cost_rate;
    // --- End of Fix ---

    // --- Dynamic Cohort for Window Sizes ---
    const sortedModels = [...modelsWithConfigs].sort((a, b) => {
        const dateA = new Date(a.api_identifier.match(/(\d{4}-\d{2}-\d{2}|\d{8})/)?.[0] ?? 0);
        const dateB = new Date(b.api_identifier.match(/(\d{4}-\d{2}-\d{2}|\d{8})/)?.[0] ?? 0);
        return dateB.getTime() - dateA.getTime(); // Sort descending by date
    });

    const sampleSize = Math.max(newModelCount, 3, Math.ceil(sortedModels.length * 0.25));
    const recentCohort = sortedModels.slice(0, sampleSize);

    const average = (arr: (number | null | undefined)[]) => {
        const filtered = arr.filter((v): v is number => typeof v === 'number' && v > 0);
        return filtered.length > 0 ? filtered.reduce((a, b) => a + b, 0) / filtered.length : 0;
    };
    
    const avgContextWindow = Math.floor(average(recentCohort.map(m => m.config.context_window_tokens)));
    const avgOutputCap = Math.floor(average(recentCohort.map(m => m.config.hard_cap_output_tokens)));

    let defaults: Partial<AiModelExtendedConfig> = {
        input_token_cost_rate: highWaterMarkInput ?? DEFAULTS.input_token_cost_rate,
        output_token_cost_rate: highWaterMarkOutput ?? DEFAULTS.output_token_cost_rate,
        context_window_tokens: avgContextWindow > 0 ? avgContextWindow : DEFAULTS.context_window_tokens,
        hard_cap_output_tokens: avgOutputCap > 0 ? avgOutputCap : DEFAULTS.hard_cap_output_tokens,
        provider_max_input_tokens: avgContextWindow > 0 ? avgContextWindow : DEFAULTS.provider_max_input_tokens,
        provider_max_output_tokens: avgOutputCap > 0 ? avgOutputCap : DEFAULTS.provider_max_output_tokens,
        tokenization_strategy: { type: 'rough_char_count', chars_per_token_ratio: 4 }
    };

    // Apply adaptive provider floors to ensure monotonicity for unknown/newer models
    const floors = this.getAdaptiveProviderFloor(currentApiIdentifier, modelsWithConfigs);
    if (floors) {
      const currentCw = (typeof defaults.context_window_tokens === 'number' && defaults.context_window_tokens > 0)
        ? defaults.context_window_tokens
        : floors.window;
      const currentProvMaxIn = (typeof defaults.provider_max_input_tokens === 'number' && defaults.provider_max_input_tokens > 0)
        ? defaults.provider_max_input_tokens
        : floors.window;
      const currentHardCap = (typeof defaults.hard_cap_output_tokens === 'number' && defaults.hard_cap_output_tokens > 0)
        ? defaults.hard_cap_output_tokens
        : floors.outputCap;
      const currentProvMaxOut = (typeof defaults.provider_max_output_tokens === 'number' && defaults.provider_max_output_tokens > 0)
        ? defaults.provider_max_output_tokens
        : floors.outputCap;

      const flooredWindow = Math.max(currentCw, floors.window);
      const flooredProvMaxIn = Math.max(currentProvMaxIn, floors.window);
      const flooredOutputCap = Math.max(currentHardCap, floors.outputCap);
      const flooredProvMaxOut = Math.max(currentProvMaxOut, floors.outputCap);
      defaults = {
        ...defaults,
        context_window_tokens: flooredWindow,
        provider_max_input_tokens: flooredProvMaxIn,
        hard_cap_output_tokens: flooredOutputCap,
        provider_max_output_tokens: flooredProvMaxOut,
      };
    }

    this.logger.info(`[ConfigAssembler] Dynamic defaults calculated (with floors applied if any): ${JSON.stringify(defaults)}`);
    return defaults;
  }

  private getAdaptiveProviderFloor(
    apiIdentifier: string | undefined,
    configured: FinalAppModelConfig[],
  ): { window: number; outputCap: number } | null {
    if (!apiIdentifier || apiIdentifier.trim().length === 0) {
      return null;
    }

    const provider = this.getProviderFromId(apiIdentifier);
    const cohort = configured.filter((m) => this.getProviderFromId(m.api_identifier) === provider);

    const pickMax = (vals: Array<number | null | undefined>, fallback: number): number => {
      const xs = vals.filter((v): v is number => typeof v === 'number' && v > 0);
      return xs.length > 0 ? Math.max(...xs) : fallback;
    };

    // Minimal safety floors when cohort empty
    const minimalFloors = (): { window: number; outputCap: number } => {
      if (provider === 'anthropic') return { window: 200_000, outputCap: 8_192 };
      if (provider === 'google') return { window: 1_048_576, outputCap: 65_536 };
      if (provider === 'openai') {
        if (/^openai-gpt-4\.1/i.test(apiIdentifier)) return { window: 1_047_576, outputCap: 4_096 };
        if (/^openai-gpt-4o/i.test(apiIdentifier)) return { window: 128_000, outputCap: 4_096 };
        return { window: 128_000, outputCap: 4_096 };
      }
      // Default to modern baseline for unknown providers
      return { window: 128_000, outputCap: 65_536 };
    };

    if (cohort.length === 0) {
      return minimalFloors();
    }

    // Provider recent high-water marks
    const maxWindow = pickMax(
      cohort.map((m) => m.config.context_window_tokens ?? m.config.provider_max_input_tokens ?? null),
      minimalFloors().window,
    );
    const maxOutput = pickMax(
      cohort.map((m) => m.config.hard_cap_output_tokens ?? m.config.provider_max_output_tokens ?? null),
      minimalFloors().outputCap,
    );

    return { window: maxWindow, outputCap: maxOutput };
  }

  private getProviderFromId(apiIdentifier: string): 'anthropic' | 'google' | 'openai' | 'unknown' {
    if (/^anthropic-/i.test(apiIdentifier)) return 'anthropic';
    if (/^google-/i.test(apiIdentifier)) return 'google';
    if (/^openai-/i.test(apiIdentifier)) return 'openai';
    return 'unknown';
  }
}
