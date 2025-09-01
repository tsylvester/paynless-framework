// supabase/functions/sync-ai-models/anthropic_sync.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { AnthropicAdapter } from '../_shared/ai_service/anthropic_adapter.ts';
import type { ProviderModelInfo, ILogger, AiModelExtendedConfig } from '../_shared/types.ts';
import type { Tables } from '../types_db.ts';
import { getCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts';
import { ConfigAssembler } from './config_assembler.ts';
import { diffAndPrepareDbOps, executeDbOps } from './diffAndPrepareDbOps.ts';
import { isJson } from "../_shared/utils/type_guards.ts";

const PROVIDER_NAME = 'anthropic';

// Tier 3 Data Source: Hardcoded internal map as a failsafe.
// This provides detailed configuration for known Anthropic models, as their API
// does not return this data.
// Source: https://docs.anthropic.com/en/docs/about-claude/models
export const INTERNAL_MODEL_MAP: Map<string, Partial<AiModelExtendedConfig>> = new Map(Object.entries({
    'anthropic-claude-opus-4-1-20250805':     { input_token_cost_rate: 20.00, output_token_cost_rate: 100.00, context_window_tokens: 200000, hard_cap_output_tokens: 8192, provider_max_input_tokens: 200000, provider_max_output_tokens: 8192, tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-opus-4-1-20250805' } },
    'anthropic-claude-opus-4-20250514':      { input_token_cost_rate: 18.00, output_token_cost_rate: 90.00,  context_window_tokens: 200000, hard_cap_output_tokens: 8192, provider_max_input_tokens: 200000, provider_max_output_tokens: 8192, tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-opus-4-20250514' } },
    'anthropic-claude-sonnet-4-20250514':     { input_token_cost_rate: 4.00,  output_token_cost_rate: 20.00,  context_window_tokens: 200000, hard_cap_output_tokens: 8192, provider_max_input_tokens: 200000, provider_max_output_tokens: 8192, tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-sonnet-4-20250514' } },
    'anthropic-claude-3-7-sonnet-20250219':   { input_token_cost_rate: 3.00,  output_token_cost_rate: 15.00,  context_window_tokens: 200000, hard_cap_output_tokens: 8192, provider_max_input_tokens: 200000, provider_max_output_tokens: 8192, tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-7-sonnet-20250219' } },
    'anthropic-claude-3-5-sonnet-20241022':  { input_token_cost_rate: 3.00,  output_token_cost_rate: 15.00,  context_window_tokens: 200000, hard_cap_output_tokens: 8192, provider_max_input_tokens: 200000, provider_max_output_tokens: 8192, tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3.5-sonnet-20241022' } },
    'anthropic-claude-3-5-haiku-20241022':   { input_token_cost_rate: 0.80,  output_token_cost_rate: 4.00,   context_window_tokens: 200000, hard_cap_output_tokens: 8192, provider_max_input_tokens: 200000, provider_max_output_tokens: 8192, tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3.5-haiku-20241022' } },
    'anthropic-claude-3-5-sonnet-20240620':  { input_token_cost_rate: 3.00,  output_token_cost_rate: 15.00,  context_window_tokens: 200000, hard_cap_output_tokens: 8192, provider_max_input_tokens: 200000, provider_max_output_tokens: 8192, tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3.5-sonnet-20240620' } },
    'anthropic-claude-3-sonnet-20240229':    { input_token_cost_rate: 3.00,  output_token_cost_rate: 15.00,  context_window_tokens: 200000, hard_cap_output_tokens: 4096, provider_max_input_tokens: 200000, provider_max_output_tokens: 4096, tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-sonnet-20240229' } },
    'anthropic-claude-3-haiku-20240307':     { input_token_cost_rate: 0.25,  output_token_cost_rate: 1.25,   context_window_tokens: 200000, hard_cap_output_tokens: 4096, provider_max_input_tokens: 200000, provider_max_output_tokens: 4096, tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-haiku-20240307' } },
    'anthropic-claude-3-opus-20240229':      { input_token_cost_rate: 15.00, output_token_cost_rate: 75.00,  context_window_tokens: 200000, hard_cap_output_tokens: 4096, provider_max_input_tokens: 200000, provider_max_output_tokens: 4096, tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3-opus-20240229' } },
}));

// --- Dependency Injection Setup ---
// Interface for dependencies required by the sync function
export interface SyncAnthropicDeps {
  listProviderModels: (apiKey: string) => Promise<{ models: ProviderModelInfo[], raw: unknown }>;
  getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// Default dependencies using actual implementations
export const defaultSyncAnthropicDeps: SyncAnthropicDeps = {
  listProviderModels: async (apiKey: string) => {
    const logger: ILogger = {
      debug: (...args: unknown[]) => console.debug('[SyncAnthropic:AnthropicAdapter]', ...args),
      info: (...args: unknown[]) => console.info('[SyncAnthropic:AnthropicAdapter]', ...args),
      warn: (...args: unknown[]) => console.warn('[SyncAnthropic:AnthropicAdapter]', ...args),
      error: (...args: unknown[]) => console.error('[SyncAnthropic:AnthropicAdapter]', ...args),
    };
    // The adapter expects a provider row with a valid AiModelExtendedConfig.
    const minimalConfig: AiModelExtendedConfig = {
      api_identifier: 'anthropic-claude-3.5-sonnet-20240620',
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: 'anthropic_tokenizer', model: 'claude-3.5-sonnet-20240620' },
    };
    if(!isJson(minimalConfig)) {
      throw new Error('minimalConfig is not a valid JSON object');
    }
    const dummyProvider: Tables<'ai_providers'> = {
      id: 'sync-anthropic-dummy',
      api_identifier: 'anthropic-claude-3.5-sonnet-20240620',
      name: 'Anthropic Sync Dummy',
      description: null,
      is_active: true,
      provider: 'anthropic',
      config: minimalConfig,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_default_embedding: false,
      is_enabled: true,
    };
    const adapter = new AnthropicAdapter(dummyProvider, apiKey, logger);
    // We call with `getRaw: true` to get the detailed data for our logs.
    const { models, raw } = await adapter.listModels(true);
    return { models, raw };
  },
  getCurrentDbModels: getCurrentDbModels,
  log: console.log,
  error: console.error,
};

/**
 * Syncs Anthropic models with the database using shared assembly and DB operation utilities.
 * @param supabaseClient - The Supabase client instance.
 * @param apiKey - The Anthropic API key.
 * @param deps - Dependencies for testability.
 * @returns A promise that resolves to a SyncResult object.
 */
export async function syncAnthropicModels(
  supabaseClient: SupabaseClient,
  apiKey: string,
  deps: SyncAnthropicDeps = defaultSyncAnthropicDeps
): Promise<SyncResult> {
  const { listProviderModels, getCurrentDbModels, log, error } = deps;
  const logger: ILogger = { info: log, warn: log, error: error, debug: log };

  try {
    // 1. Fetch data
    logger.info(`Fetching models from ${PROVIDER_NAME} API...`);
    const { models: apiModels, raw: rawApiData } = await listProviderModels(apiKey);
    logger.info(`Fetched ${apiModels.length} models from ${PROVIDER_NAME} API.`);
    logger.info('Anthropic models found:', { models: apiModels.map((m) => m.api_identifier) });
    const dbModels = await getCurrentDbModels(supabaseClient, PROVIDER_NAME);
    logger.info(`Found ${dbModels.length} existing DB models for ${PROVIDER_NAME}.`);

    // 2. Assemble Configurations
    const assembler = new ConfigAssembler({
        apiModels,
        // Anthropic has no external capabilities source, so we provide an empty one.
        externalCapabilities: () => Promise.resolve(new Map()),
        internalModelMap: INTERNAL_MODEL_MAP,
        logger,
    });
    let assembledConfigs = await assembler.assemble();

    // Provider-specific hardening: ensure Anthropic chat models use official tokenizer strategy
    assembledConfigs = assembledConfigs.map((cfg) => {
      const modelId = cfg.api_identifier.replace(/^anthropic-/i, '');
      const strat = cfg.config.tokenization_strategy;
      if (strat.type !== 'anthropic_tokenizer') {
        cfg.config.tokenization_strategy = { type: 'anthropic_tokenizer', model: modelId };
      } else if (!strat.model || strat.model.trim().length === 0) {
        cfg.config.tokenization_strategy = { type: 'anthropic_tokenizer', model: modelId };
      }
      return cfg;
    });

    // 3. Diff and Prepare DB Operations
    const ops = diffAndPrepareDbOps(
        assembledConfigs,
        dbModels,
        PROVIDER_NAME,
        logger
    );

    // 4. Execute DB operations
    const { inserted, updated, deactivated } = await executeDbOps(
        supabaseClient,
        PROVIDER_NAME,
        ops,
        logger,
    );

    return { 
      provider: PROVIDER_NAME, 
      inserted, 
      updated, 
      deactivated,
      debug_data: rawApiData 
    };

  } catch (e) { 
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error(`!!! Sync failed for provider ${PROVIDER_NAME}:`, { error: err.message }); 
    return { provider: PROVIDER_NAME, inserted: 0, updated: 0, deactivated: 0, error: err.message };
  }
}
