// supabase/functions/sync-ai-models/google_sync.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAdapter } from '../_shared/ai_service/google_adapter.ts';
import type { ProviderModelInfo, ILogger, AiModelExtendedConfig } from '../_shared/types.ts';
import type { Tables } from '../types_db.ts';
import { getCurrentDbModels } from './index.ts';
import { SyncResult, DbAiProvider } from './sync-ai-models.interface.ts';
import { ConfigAssembler } from './config_assembler.ts';
import { diffAndPrepareDbOps, executeDbOps } from './diffAndPrepareDbOps.ts';
import { isJson } from "../_shared/utils/type_guards.ts";

const PROVIDER_NAME = 'google';

// Canonical Google Gemini API pricing (verify rates when adding models):
// https://ai.google.dev/gemini-api/docs/pricing
//
// This map must be updated when new models are observed from the provider API. Models without map
// entries will be inserted as disabled with null costs until configured.
//
// Keys use longest-prefix matching against each model `api_identifier` (see `getLongestPrefixInternalMapEntry`).
// List more specific prefixes before shorter ones in comments only; resolution uses longest key length.
//
// Tier 3 Data Source: Hardcoded internal map as a failsafe.
// This provides cost and tokenization info. The Google Adapter provides token limits (Tier 1).
// Cost rates are the application's normalized cost for 1 million units (tokens).
export const INTERNAL_MODEL_MAP: Map<string, Partial<AiModelExtendedConfig>> = new Map(Object.entries({
    // --- Deep Research & non-Gemini-flash “latest” aliases (explicit longest prefixes first) ---
    'google-deep-research-pro-preview': { input_token_cost_rate: 2.50, output_token_cost_rate: 15.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-nano-banana-pro-preview': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 131_072, provider_max_output_tokens: 32_768 },
    'google-gemini-pro-latest': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-flash-lite-latest': { input_token_cost_rate: 0.25, output_token_cost_rate: 1.50, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-flash-latest': { input_token_cost_rate: 0.50, output_token_cost_rate: 3.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },

    // --- Gemini 3.1 (preview SKUs: flash-image / flash-lite / pro / custom tools before shorter 3.1 roots) ---
    'google-gemini-3.1-pro-preview-customtools': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-3.1-pro-preview': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-3.1-pro': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-3.1-flash-image-preview': { input_token_cost_rate: 0.50, output_token_cost_rate: 3.00, provider_max_input_tokens: 65_536, provider_max_output_tokens: 65_536 },
    'google-gemini-3.1-flash-image': { input_token_cost_rate: 0.50, output_token_cost_rate: 3.00, provider_max_input_tokens: 65_536, provider_max_output_tokens: 65_536 },
    'google-gemini-3.1-flash-lite-preview': { input_token_cost_rate: 0.25, output_token_cost_rate: 1.50, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-3.1-flash-lite': { input_token_cost_rate: 0.25, output_token_cost_rate: 1.50, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-3.1-flash': { input_token_cost_rate: 0.50, output_token_cost_rate: 3.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-3.1': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },

    // --- Gemini 3.0 / 3 (flash before bare 3; pro image before pro) ---
    'google-gemini-3-pro-image-preview': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 131_072, provider_max_output_tokens: 32_768 },
    'google-gemini-3-pro-image': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 131_072, provider_max_output_tokens: 32_768 },
    'google-gemini-3-pro-preview': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-3-pro': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-3-flash-preview': { input_token_cost_rate: 0.50, output_token_cost_rate: 3.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-3-flash': { input_token_cost_rate: 0.50, output_token_cost_rate: 3.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-3': { input_token_cost_rate: 2.00, output_token_cost_rate: 12.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },

    // --- Gemini 2.5 (flash-lite before flash; image / preview / TTS before families) ---
    'google-gemini-2.5-computer-use-preview-10-2025': { input_token_cost_rate: 2.50, output_token_cost_rate: 15.00, provider_max_input_tokens: 131_072, provider_max_output_tokens: 65_536 },
    'google-gemini-2.5-pro-preview-tts': { input_token_cost_rate: 1.00, output_token_cost_rate: 20.00, provider_max_input_tokens: 8_192, provider_max_output_tokens: 16_384 },
    'google-gemini-2.5-pro-preview': { input_token_cost_rate: 2.50, output_token_cost_rate: 15.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-2.5-pro': { input_token_cost_rate: 2.50, output_token_cost_rate: 15.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-2.5-flash-preview-tts': { input_token_cost_rate: 0.50, output_token_cost_rate: 10.00, provider_max_input_tokens: 8_192, provider_max_output_tokens: 16_384 },
    'google-gemini-2.5-flash-preview': { input_token_cost_rate: 0.30, output_token_cost_rate: 2.50, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-2.5-flash-image-preview': { input_token_cost_rate: 0.30, output_token_cost_rate: 2.50, provider_max_input_tokens: 32_768, provider_max_output_tokens: 8_192 },
    'google-gemini-2.5-flash-image': { input_token_cost_rate: 0.30, output_token_cost_rate: 2.50, provider_max_input_tokens: 32_768, provider_max_output_tokens: 32_768 },
    'google-gemini-2.5-flash-lite-preview': { input_token_cost_rate: 0.10, output_token_cost_rate: 0.40, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-2.5-flash-lite': { input_token_cost_rate: 0.10, output_token_cost_rate: 0.40, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-2.5-flash': { input_token_cost_rate: 0.30, output_token_cost_rate: 2.50, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-2.5': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.00, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 64_000 },

    // --- Gemini 2.0 (deprecated SKUs; lite / exp / image / thinking before base flash) ---
    'google-gemini-2.0-pro-exp': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.00, provider_max_input_tokens: 1_048_576, provider_max_output_tokens: 65_536 },
    'google-gemini-2.0-flash-exp-image-generation': { input_token_cost_rate: 0.10, output_token_cost_rate: 0.40, provider_max_input_tokens: 1_048_576, provider_max_output_tokens: 8_192 },
    'google-gemini-2.0-flash-exp': { input_token_cost_rate: 0.10, output_token_cost_rate: 0.40, provider_max_input_tokens: 1_048_576, provider_max_output_tokens: 8_192 },
    'google-gemini-2.0-flash-thinking-exp': { input_token_cost_rate: 0.10, output_token_cost_rate: 0.40, provider_max_input_tokens: 1_048_576, provider_max_output_tokens: 65_536 },
    'google-gemini-2.0-flash-preview-image-generation': { input_token_cost_rate: 0.10, output_token_cost_rate: 0.40, provider_max_input_tokens: 32_768, provider_max_output_tokens: 8_192 },
    'google-gemini-2.0-flash-lite-preview': { input_token_cost_rate: 0.075, output_token_cost_rate: 0.30, provider_max_input_tokens: 1_048_576, provider_max_output_tokens: 8_192 },
    'google-gemini-2.0-flash-lite': { input_token_cost_rate: 0.075, output_token_cost_rate: 0.30, provider_max_input_tokens: 1_048_576, provider_max_output_tokens: 8_192 },
    'google-gemini-2.0-flash': { input_token_cost_rate: 0.10, output_token_cost_rate: 0.40, provider_max_input_tokens: 1_048_576, provider_max_output_tokens: 8_192 },

    // --- Gemini 1.5 & legacy ---
    'google-gemini-1.0-pro-vision': { input_token_cost_rate: 0.50, output_token_cost_rate: 1.50, provider_max_input_tokens: 12_288, provider_max_output_tokens: 4_096 },
    'google-gemini-1.5-pro-latest': { input_token_cost_rate: 2.50, output_token_cost_rate: 10.00 },
    'google-gemini-1.5-pro': { input_token_cost_rate: 2.50, output_token_cost_rate: 10.00 },
    'google-gemini-1.5-flash-latest': { input_token_cost_rate: 0.60, output_token_cost_rate: 0.60 },
    'google-gemini-1.5-flash': { input_token_cost_rate: 0.60, output_token_cost_rate: 0.60 },
    'google-gemini-1.5-flash-8b': { input_token_cost_rate: 0.30, output_token_cost_rate: 0.30 },

    'google-gemini-robotics-er-1.5-preview': { input_token_cost_rate: 0.30, output_token_cost_rate: 2.50, provider_max_input_tokens: 1_000_000, provider_max_output_tokens: 65_536 },
    'google-gemini-exp-1206': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.00, provider_max_input_tokens: 1_048_576, provider_max_output_tokens: 65_536 },

    // --- Open-weight Gemma (paid tier uses token rates from Gemma / Gemini API listings; conservative Flash-class proxy) ---
    'google-gemma-3n': { input_token_cost_rate: 0.10, output_token_cost_rate: 0.30, provider_max_input_tokens: 8_192, provider_max_output_tokens: 2_048 },
    'google-gemma-3': { input_token_cost_rate: 0.10, output_token_cost_rate: 0.30, provider_max_input_tokens: 131_072, provider_max_output_tokens: 8_192 },

    'google-learnlm-2.0-flash-experimental': { input_token_cost_rate: 0.10, output_token_cost_rate: 0.40, provider_max_input_tokens: 1_048_576, provider_max_output_tokens: 32_768 },

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
      is_default_generation: false,
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
    logger.info(`Fetching models from ${PROVIDER_NAME} API...`);
    const { models: apiModels, raw: rawApiData } = await listProviderModels(apiKey);
    logger.info(`Fetched ${apiModels.length} models from ${PROVIDER_NAME} API.`);
    const dbModels = await getCurrentDbModels(supabaseClient, PROVIDER_NAME);
    logger.info(`Found ${dbModels.length} existing DB models for ${PROVIDER_NAME}.`);

    const assembler = new ConfigAssembler({
        apiModels,
        externalCapabilities: () => Promise.resolve(new Map()),
        internalModelMap: INTERNAL_MODEL_MAP,
        logger,
    });
    const { models: assembledConfigs, costProvenance } = await assembler.assemble();

    const ops = diffAndPrepareDbOps(
        assembledConfigs,
        dbModels,
        PROVIDER_NAME,
        logger,
        costProvenance,
    );

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
