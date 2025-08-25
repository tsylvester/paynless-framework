// supabase/functions/sync-ai-models/google_sync.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAdapter } from '../_shared/ai_service/google_adapter.ts';
import type { ProviderModelInfo, ILogger, AiModelExtendedConfig } from '../_shared/types.ts';
import type { Tables } from '../types_db.ts';
import { getCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts';
import { ConfigAssembler } from './config_assembler.ts';
import { diffAndPrepareDbOps, executeDbOps } from './diffAndPrepareDbOps.ts';
import { isJson } from "../_shared/utils/type_guards.ts";

const PROVIDER_NAME = 'google';

// Tier 3 Data Source: Hardcoded internal map as a failsafe.
// This provides cost and tokenization info. The Google Adapter provides token limits (Tier 1).
// The keys are partial and will be matched against the full API identifier.
// Cost rates are the application's normalized cost for 1 million units (tokens).
// Source: https://ai.google.dev/gemini-api/docs/pricing
export const INTERNAL_MODEL_MAP: Map<string, Partial<AiModelExtendedConfig>> = new Map(Object.entries({
    // --- Gemini 2.5 Series ---
    'google-gemini-2.5-pro': { input_token_cost_rate: 2.50, output_token_cost_rate: 15.00 },
    'google-gemini-2.5-flash': { input_token_cost_rate: 1.00, output_token_cost_rate: 2.50 },
    'google-gemini-2.5-flash-lite': { input_token_cost_rate: 0.30, output_token_cost_rate: 0.40 },

    // --- Gemini 1.5 Series ---
    'google-gemini-1.5-pro-latest': { input_token_cost_rate: 2.50, output_token_cost_rate: 10.00 },
    'google-gemini-1.5-pro': { input_token_cost_rate: 2.50, output_token_cost_rate: 10.00 },
    'google-gemini-1.5-flash-latest': { input_token_cost_rate: 0.60, output_token_cost_rate: 0.60 },
    'google-gemini-1.5-flash': { input_token_cost_rate: 0.60, output_token_cost_rate: 0.60 },
    'google-gemini-1.5-flash-8b': { input_token_cost_rate: 0.30, output_token_cost_rate: 0.30 },
    
    // --- Legacy Models ---
    'google-gemini-pro': { input_token_cost_rate: 0.50, output_token_cost_rate: 1.50 },

    // --- Embedding Models ---
    'google-gemini-embedding': { input_token_cost_rate: 0.15, output_token_cost_rate: 1 },
    'google-embedding-gecko-001': { input_token_cost_rate: 0.1, output_token_cost_rate: 1 },
    'google-embedding-001': { input_token_cost_rate: 0.1, output_token_cost_rate: 1 },
    'google-text-embedding-004': { input_token_cost_rate: 0.1, output_token_cost_rate: 1 },
}).map(([key, value]) => {
    const config: Partial<AiModelExtendedConfig> = {
        ...value,
        tokenization_strategy: {
            type: 'google_gemini_tokenizer',
            // Apply default chars_per_token_ratio for chat models; will be ignored by embeddings
            chars_per_token_ratio: 4.0,
        }
    };
    return [key, config];
}));



// --- Dependency Injection Setup ---
export interface SyncGoogleDeps {
  listProviderModels: (apiKey: string) => Promise<{ models: ProviderModelInfo[], raw: unknown }>;
  getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export const defaultSyncGoogleDeps: SyncGoogleDeps = {
  listProviderModels: async (apiKey: string) => {
    const logger: ILogger = {
      debug: (...args: unknown[]) => console.debug('[SyncGoogle:GoogleAdapter]', ...args),
      info: (...args: unknown[]) => console.info('[SyncGoogle:GoogleAdapter]', ...args),
      warn: (...args: unknown[]) => console.warn('[SyncGoogle:GoogleAdapter]', ...args),
      error: (...args: unknown[]) => console.error('[SyncGoogle:GoogleAdapter]', ...args),
    };
    // Construct a minimal provider shape required by the adapter constructor.
    // The adapter validates provider.config via isAiModelExtendedConfig, so provide a minimal valid config.
    const minimalConfig: AiModelExtendedConfig = {
      api_identifier: 'google-gemini-2.5-pro',
      input_token_cost_rate: 0,
      output_token_cost_rate: 0,
      tokenization_strategy: { type: 'google_gemini_tokenizer' },
    };
    if(!isJson(minimalConfig)) {
      throw new Error('minimalConfig is not a valid JSON object');
    }
    const dummyProvider: Tables<'ai_providers'> = {
      id: 'sync-google-dummy',
      api_identifier: 'google-gemini-2.5-pro',
      name: 'Google Sync Dummy',
      description: null,
      is_active: true,
      provider: 'google',
      config: minimalConfig,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_default_embedding: false,
      is_enabled: true,
    };
    const adapter = new GoogleAdapter(dummyProvider, apiKey, logger);
    const { models, raw } = await adapter.listModels(true);
    return { models, raw };
  },
  getCurrentDbModels: getCurrentDbModels,
  log: console.log,
  error: console.error,
};

/**
 * Syncs Google models with the database using shared assembly and DB operation utilities.
 */
export async function syncGoogleModels(
  supabaseClient: SupabaseClient,
  apiKey: string,
  deps: SyncGoogleDeps = defaultSyncGoogleDeps
): Promise<SyncResult> {
  const { listProviderModels, getCurrentDbModels, log, error } = deps;
  const logger: ILogger = { info: log, warn: log, error: error, debug: log };

  try {
    // 1. Fetch data
    logger.info(`Fetching models from ${PROVIDER_NAME} API...`);
    const { models: apiModels, raw: rawApiData } = await listProviderModels(apiKey);
    logger.info(`Fetched ${apiModels.length} models from ${PROVIDER_NAME} API.`);
    const dbModels = await getCurrentDbModels(supabaseClient, PROVIDER_NAME);
    logger.info(`Found ${dbModels.length} existing DB models for ${PROVIDER_NAME}.`);

    // 2. Assemble Configurations
    const assembler = new ConfigAssembler({
        apiModels,
        // The Google adapter doesn't provide structured data, so we don't have an external source.
        // We rely on the internal map for tokenization and cost info.
        externalCapabilities: () => Promise.resolve(new Map()),
        internalModelMap: INTERNAL_MODEL_MAP,
        logger,
    });
    const assembledConfigs = await assembler.assemble();

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