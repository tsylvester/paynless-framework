import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { OpenAiAdapter } from '../_shared/ai_service/openai_adapter.ts';
import type { ProviderModelInfo, ILogger, AiModelExtendedConfig } from '../_shared/types.ts';
import { getCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts';
import { ConfigAssembler } from './config_assembler.ts';
import { diffAndPrepareDbOps, executeDbOps } from './diffAndPrepareDbOps.ts';

const PROVIDER_NAME = 'openai';
const MODEL_CAPABILITIES_URL = 'https://raw.githubusercontent.com/Intelligent-Intern/openai-model-capabilities/refs/heads/main/latest.json';

// Tier 3 Data Source: Hardcoded internal map as a failsafe.
// This map provides high-confidence, sparse overrides for models where the API's
// returned data is known to be incomplete or incorrect. It adheres to a strict
// "no invention" policy, only providing values that are known to be factual.
// Cost rates are the application's normalized cost for 1 million units (tokens, images, etc.).
const modelMapSource: { [key: string]: Partial<Pick<AiModelExtendedConfig, 'input_token_cost_rate' | 'output_token_cost_rate' | 'context_window_tokens' | 'hard_cap_output_tokens'>> } = {
    // --- GPT-5 Series (Speculative Pricing) ---
    'openai-gpt-5': { input_token_cost_rate: 1250, output_token_cost_rate: 10000, context_window_tokens: 400000 },
    'openai-gpt-5-mini': { input_token_cost_rate: 250, output_token_cost_rate: 2000, context_window_tokens: 128000 },
    'openai-gpt-5-nano': { input_token_cost_rate: 50, output_token_cost_rate: 400, context_window_tokens: 128000 },

    // --- GPT-4 Series ---
    'openai-gpt-4o': { input_token_cost_rate: 5.0, output_token_cost_rate: 15.0, context_window_tokens: 128000 },
    'openai-gpt-4o-mini': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000 },
    'openai-gpt-4-turbo': { input_token_cost_rate: 10.0, output_token_cost_rate: 30.0, context_window_tokens: 128000 },
    'openai-gpt-4': { input_token_cost_rate: 30.0, output_token_cost_rate: 60.0, context_window_tokens: 8192 },
    'openai-gpt-4.1': { input_token_cost_rate: 2000, output_token_cost_rate: 8000, context_window_tokens: 1047576 },
    'openai-gpt-4.1-mini': { input_token_cost_rate: 400, output_token_cost_rate: 1600, context_window_tokens: 1047576 },
    'openai-gpt-4.1-nano': { input_token_cost_rate: 100, output_token_cost_rate: 1400, context_window_tokens: 1047576 },
    
    // --- GPT-3.5 Series ---
    'openai-gpt-3.5-turbo': { input_token_cost_rate: 0.5, output_token_cost_rate: 1.5, context_window_tokens: 16385 },

    // --- O1 Series (Speculative Pricing) ---
    'openai-o1': { context_window_tokens: 200000, input_token_cost_rate: 10, output_token_cost_rate: 40 },
    'openai-o1-mini': { context_window_tokens: 200000, input_token_cost_rate: 0.15, output_token_cost_rate: 0.15 },

    // --- Embedding Models ---
    // The API does not provide context_window_tokens. We provide them here.
    // Application business logic requires a non-zero output cost.
    'openai-text-embedding-3-small': { context_window_tokens: 8191, input_token_cost_rate: 0.02, output_token_cost_rate: 1.0 },
    'openai-text-embedding-3-large': { context_window_tokens: 8191, input_token_cost_rate: 0.13, output_token_cost_rate: 1.0 },
    'openai-text-embedding-ada-002': { context_window_tokens: 8191, input_token_cost_rate: 0.10, output_token_cost_rate: 1.0 },

    // --- Image & Audio Models (Context window data often unavailable) ---
    // Costs are per 1M units (images, characters, minutes)
    'openai-dall-e-3': { input_token_cost_rate: 40000, output_token_cost_rate: 40000 },
    'openai-dall-e-2': { input_token_cost_rate: 20000, output_token_cost_rate: 20000 },
    'openai-tts-1-hd': { input_token_cost_rate: 30, output_token_cost_rate: 30 },
    'openai-tts-1': { input_token_cost_rate: 15, output_token_cost_rate: 15 },
    'openai-whisper-1': { input_token_cost_rate: 6000, output_token_cost_rate: 6000 },
};

const INTERNAL_MODEL_MAP: Map<string, Partial<AiModelExtendedConfig>> = new Map(Object.entries(modelMapSource).map(([key, value]) => {
    const modelId = key.replace(/^openai-/i, '');
    const isEmbeddingModel = modelId.includes('embedding');
    
    // Consistently apply the correct tokenization strategy.
    const tokenization_strategy: AiModelExtendedConfig['tokenization_strategy'] = {
        type: 'tiktoken',
        tiktoken_encoding_name: 'cl100k_base',
        is_chatml_model: !isEmbeddingModel,
        api_identifier_for_tokenization: modelId,
    };

    // Link provider_max tokens to context_window, as they are functionally equivalent.
    const providerMaxTokens = value.context_window_tokens ? {
        provider_max_input_tokens: value.context_window_tokens,
        // Default output tokens to a safe value if not explicitly set in the map.
        provider_max_output_tokens: value.hard_cap_output_tokens ?? 4096 
    } : {};
    
    return [key, { ...value, ...providerMaxTokens, tokenization_strategy }];
}));

// Tier 2 Data Source: Fetches model capabilities from an external source.
async function getExternalCapabilities(logger: ILogger): Promise<Map<string, Partial<AiModelExtendedConfig>>> {
  try {
    logger.info(`Fetching external capabilities from ${MODEL_CAPABILITIES_URL}`);
    const response = await fetch(MODEL_CAPABILITIES_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch model capabilities: ${response.statusText}`);
    }
    const data = await response.json();
    const capabilities = new Map<string, Partial<AiModelExtendedConfig>>();
    if (data && Array.isArray(data.data)) {
      for (const model of data.data) {
        if (model && typeof model.id === 'string' && typeof model.max_tokens === 'number') {
          capabilities.set(`openai-${model.id}`, { context_window_tokens: model.max_tokens });
        }
      }
    }
    logger.info(`Successfully fetched and parsed ${capabilities.size} external model capabilities.`);
    return capabilities;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    logger.error('Error fetching external model capabilities.', { error: errorMessage });
    return new Map();
  }
}

// --- Dependency Injection Setup ---
export interface SyncOpenAIDeps {
  listProviderModels: (apiKey: string) => Promise<{ models: ProviderModelInfo[], raw: unknown }>;
  getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export const defaultSyncOpenAIDeps: SyncOpenAIDeps = {
  listProviderModels: async (apiKey: string) => {
    const logger: ILogger = {
      debug: (...args: unknown[]) => console.debug('[SyncOpenAI:OpenAiAdapter]', ...args),
      info: (...args: unknown[]) => console.info('[SyncOpenAI:OpenAiAdapter]', ...args),
      warn: (...args: unknown[]) => console.warn('[SyncOpenAI:OpenAiAdapter]', ...args),
      error: (...args: unknown[]) => console.error('[SyncOpenAI:OpenAiAdapter]', ...args),
    };
    const adapter = new OpenAiAdapter(apiKey, logger, { /* Minimal config for listModels */ } as AiModelExtendedConfig);
    const { models, raw } = await adapter.listModels(true);
    return { models, raw };
  },
  getCurrentDbModels: getCurrentDbModels,
  log: console.log,
  error: console.error,
};

/**
 * Syncs OpenAI models with the database using shared assembly and DB operation utilities.
 */
export async function syncOpenAIModels(
  supabaseClient: SupabaseClient, 
  apiKey: string,
  deps: SyncOpenAIDeps = defaultSyncOpenAIDeps
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
        // Tier 2 external source is temporarily disabled due to unreliable/stale data.
        // Re-enable this if a trusted, up-to-date source for model capabilities is found.
        // externalCapabilities: () => getExternalCapabilities(logger), 
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
