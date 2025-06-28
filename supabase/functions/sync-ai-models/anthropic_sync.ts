import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { AnthropicAdapter } from '../_shared/ai_service/anthropic_adapter.ts'; // Import AnthropicAdapter class
import type { ProviderModelInfo, ILogger } from '../_shared/types.ts'; // Added ILogger
import type { AiModelExtendedConfig } from '../_shared/types.ts';
import { getCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index
import type { Json } from '../types_db.ts'; // Added import

const PROVIDER_NAME = 'anthropic';

// Helper function to create a default AiModelExtendedConfig for Anthropic models
export function createDefaultAnthropicConfig(modelApiIdentifier: string): AiModelExtendedConfig {
  const modelId = modelApiIdentifier.toLowerCase(); // Normalize to lowercase for easier matching
  const contextWindow = 200000; // Standard for current Claude 3 & 3.5 models
  let hardCapOutput = 4096;   // Default, will be overridden for specific models
  let inputCostRate = 0.0;    // Placeholder, will be overridden
  let outputCostRate = 0.0;   // Placeholder, will be overridden

  // Prices per 1 million tokens. Will be converted to per-token rate.
  // Opus: $15 input, $75 output
  // Sonnet 3.5: $3 input, $15 output
  // Haiku: $0.25 input, $1.25 output
  // Sonnet (older, e.g. claude-3-sonnet-20240229): Treat same as Sonnet 3.5 for now if no specific pricing found.

  if (modelId.includes('opus')) {
    inputCostRate = 15.0 / 1000000;
    outputCostRate = 75.0 / 1000000;
    hardCapOutput = 4096; // Anthropic docs state 4096 for Opus
  } else if (modelId.includes('claude-3.5-sonnet') || modelId.includes('sonnet-20240620')) { // Catches claude-3.5-sonnet-20240620
    inputCostRate = 3.0 / 1000000;
    outputCostRate = 15.0 / 1000000;
    hardCapOutput = 8192; // Claude 3.5 Sonnet has 8k output
  } else if (modelId.includes('sonnet')) { // Catches other sonnet versions like claude-3-sonnet-20240229
    inputCostRate = 3.0 / 1000000; // Assume similar pricing to 3.5 if not specified
    outputCostRate = 15.0 / 1000000;
    // Older Sonnet (non-3.5) might have 4096 or other caps, Anthropic site implies 3.5 is 8k, others generally 4k
    // Web search indicated "Claude Sonnet 4 / 3.7: 64,000 tokens" this requires more clarity from Anthropic for older/non-3.5 Sonnet
    // For now, sticking to a common Sonnet cap or a conservative one if not 3.5
    // The anthropic site under models lists "Max output tokens" for Claude 3 Sonnet as 4096.
    // Let's assume 4096 for non-3.5 Sonnets for now for hard_cap unless API specifies otherwise
    hardCapOutput = 4096;
  } else if (modelId.includes('haiku')) {
    inputCostRate = 0.25 / 1000000;
    outputCostRate = 1.25 / 1000000;
    hardCapOutput = 4096; // Claude 3 Haiku has 4k output
  } else {
    // Fallback for unknown Anthropic models - use a conservative default or log a warning
    // These are placeholders and should ideally be updated if new models are common
    inputCostRate = 1.0 / 1000000;  // Generic placeholder
    outputCostRate = 1.0 / 1000000; // Generic placeholder
    // contextWindow and hardCapOutput remain their initial defaults
  }

  // For Anthropic, token counting is typically handled via their API or specific libraries.
  // 'claude_tokenizer' is a placeholder for a more specific strategy if one becomes standard.
  const tokenizationStrategy: AiModelExtendedConfig['tokenization_strategy'] = {
    type: 'claude_tokenizer', 
  };

  return {
    api_identifier: modelApiIdentifier, // Ensure api_identifier is returned
    input_token_cost_rate: inputCostRate,
    output_token_cost_rate: outputCostRate,
    context_window_tokens: contextWindow,
    hard_cap_output_tokens: hardCapOutput, // This is our application's hard cap for generation
    tokenization_strategy: tokenizationStrategy,
    provider_max_input_tokens: contextWindow, // For Anthropic, context window is effectively max input
    provider_max_output_tokens: hardCapOutput, // Anthropic's stated max output for the model
  };
}

// Type guard to check if an object is a partial AiModelExtendedConfig
function isPartialAiModelExtendedConfig(obj: unknown): obj is Partial<AiModelExtendedConfig> {
  if (typeof obj !== 'object' || obj === null) return false;
  // Basic check, can be made more robust if needed
  return true;
}

// --- Dependency Injection Setup ---
// Interface for dependencies required by the sync function
export interface SyncAnthropicDeps {
  listProviderModels: (apiKey: string) => Promise<ProviderModelInfo[]>;
  getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// Default dependencies using actual implementations
export const defaultSyncAnthropicDeps: SyncAnthropicDeps = {
  listProviderModels: async (apiKey: string): Promise<ProviderModelInfo[]> => {
    const logger: ILogger = {
      debug: (...args: unknown[]) => console.debug('[SyncAnthropic:AnthropicAdapter]', ...args),
      info: (...args: unknown[]) => console.info('[SyncAnthropic:AnthropicAdapter]', ...args),
      warn: (...args: unknown[]) => console.warn('[SyncAnthropic:AnthropicAdapter]', ...args),
      error: (...args: unknown[]) => console.error('[SyncAnthropic:AnthropicAdapter]', ...args),
    };
    const adapter = new AnthropicAdapter(apiKey, logger);
    return adapter.listModels();
  },
  getCurrentDbModels: getCurrentDbModels,
  log: console.log,
  error: console.error,
};

/**
 * Syncs Anthropic models with the database.
 * Accepts dependencies for testability.
 */
export async function syncAnthropicModels(
  supabaseClient: SupabaseClient,
  apiKey: string,
  deps: SyncAnthropicDeps = defaultSyncAnthropicDeps // Inject dependencies
): Promise<SyncResult> {
  let insertedCount = 0;
  let updatedCount = 0;
  let deactivatedCount = 0;
  const { listProviderModels, getCurrentDbModels, log, error } = deps;

  try {
    // 1. Fetch models from Anthropic API
    log(`Fetching models from ${PROVIDER_NAME} API...`);
    const apiModels = await listProviderModels(apiKey);
    log(`Fetched ${apiModels.length} models from ${PROVIDER_NAME} API.`);
    const apiModelMap = new Map(apiModels.map(m => [m.api_identifier, m]));

    // 2. Fetch current Anthropic models from DB
    const dbModels = await getCurrentDbModels(supabaseClient, PROVIDER_NAME);
    const dbModelMap = new Map<string, DbAiProvider>(
        dbModels.map((m: DbAiProvider) => [m.api_identifier, m])
    );
    log(`Found ${dbModels.length} existing DB models for ${PROVIDER_NAME}.`);

    // 3. Determine operations
    const modelsToInsert: Omit<DbAiProvider, 'id' | 'is_active'>[] = [];
    const modelsToUpdate: { id: string; changes: Partial<DbAiProvider> }[] = [];
    const modelsToDeactivate: string[] = [];
    
    log("--- Starting API model diff ---");
    for (const [apiIdentifier, apiModel] of apiModelMap.entries()) {
      log(`[Diff] Processing API model: ${apiIdentifier}`);
      const dbModel = dbModelMap.get(apiIdentifier);
      
      // apiModel.config from Anthropic adapter's listModels will be undefined
      // as the API doesn't provide structured config data.

      if (dbModel) {
        log(`[Diff]   Found matching DB model (ID: ${dbModel.id}, Active: ${dbModel.is_active}, Config: ${JSON.stringify(dbModel.config)})`);
        const changes: Partial<DbAiProvider> = {};
        if (apiModel.name !== dbModel.name) changes.name = apiModel.name;
        if ((apiModel.description ?? null) !== dbModel.description) changes.description = apiModel.description ?? null;
        if (!dbModel.is_active) changes.is_active = true;

        let baseConfig = createDefaultAnthropicConfig(apiIdentifier);
        if (dbModel.config && isPartialAiModelExtendedConfig(dbModel.config)) {
            const parsedDbConfig = dbModel.config;
            baseConfig = {
                ...baseConfig, // Start with defaults derived from model ID
                ...parsedDbConfig, // Override with any stored values (manual edits)
                tokenization_strategy: { // Ensure strategy is well-formed
                    ...baseConfig.tokenization_strategy, 
                    ...(parsedDbConfig.tokenization_strategy || {}),
                },
            };
        }
        
        // Compare current dbModel.config with the potentially updated baseConfig
        // (which includes current defaults + existing overrides)
        // This ensures that if our default generation logic changes, it gets applied,
        // unless specific fields were manually changed.
        if (JSON.stringify(dbModel.config) !== JSON.stringify(baseConfig)) {
            changes.config = baseConfig as unknown as Json;
            log(`[Diff]     Config changes detected for ${apiIdentifier}:`, baseConfig);
        }

        if (Object.keys(changes).length > 0) {
          log(`[Diff]     Overall changes for ${apiIdentifier}:`, changes);
          modelsToUpdate.push({ id: dbModel.id, changes });
        } else {
          log(`[Diff]     No changes detected for ${apiIdentifier}.`);
        }
        dbModelMap.delete(apiIdentifier);
        log(`[Diff]   Removed ${apiIdentifier} from dbModelMap (Remaining size: ${dbModelMap.size})`);
      } else {
        log(`[Diff]   No matching DB model found. Queuing for insert.`);
        const newModelConfig = createDefaultAnthropicConfig(apiIdentifier);
        modelsToInsert.push({
          api_identifier: apiIdentifier,
          name: apiModel.name,
          description: apiModel.description ?? null,
          provider: PROVIDER_NAME,
          config: newModelConfig as unknown as Json, // Add the default config
        });
        log(`[Diff]   Queued for insert with config:`, newModelConfig);
      }
    }
    log("--- Finished API model diff ---");

    log(`--- Starting DB model cleanup (Models remaining in dbModelMap: ${dbModelMap.size}) ---`);
    log("[Cleanup] Remaining DB models IDs:", Array.from(dbModelMap.keys()));
    for (const dbModel of dbModelMap.values()) {
      log(`[Cleanup] Processing remaining DB model: ${dbModel.api_identifier} (ID: ${dbModel.id}, Active: ${dbModel.is_active})`);
      if (dbModel.is_active) {
        log(`[Cleanup]   Model is active. Queuing for deactivation.`);
        modelsToDeactivate.push(dbModel.id);
      } else {
        log(`[Cleanup]   Model is already inactive. Skipping.`);
      }
    }
    log("--- Finished DB model cleanup ---");

    // 4. Execute DB Operations
    if (modelsToInsert.length > 0) {
      log(`Inserting ${modelsToInsert.length} new ${PROVIDER_NAME} models...`);
      const { error: insertError } = await supabaseClient.from('ai_providers').insert(modelsToInsert);
      if (insertError) {
        error(`Insert resolved with error object for ${PROVIDER_NAME}:`, insertError);
        throw new Error(`Insert failed for ${PROVIDER_NAME}: ${insertError.message}`);
      }
      insertedCount = modelsToInsert.length;
    }

    if (modelsToUpdate.length > 0) {
      log(`Updating ${modelsToUpdate.length} ${PROVIDER_NAME} models...`);
      for (const update of modelsToUpdate) {
        const { error: updateError } = await supabaseClient.from('ai_providers').update(update.changes).eq('id', update.id);
        if (updateError) {
          error(`Update resolved with error object for model ID ${update.id} (${PROVIDER_NAME}):`, updateError);
          throw new Error(`Update failed for model ID ${update.id} (${PROVIDER_NAME}): ${updateError.message}`);
        }
      }
      updatedCount = modelsToUpdate.length;
    }

    if (modelsToDeactivate.length > 0) {
      log(`Deactivating ${modelsToDeactivate.length} ${PROVIDER_NAME} models...`);
      const { error: deactivateError } = await supabaseClient
        .from('ai_providers')
        .update({ is_active: false })
        .in('id', modelsToDeactivate);
      if (deactivateError) {
        error(`Deactivation resolved with error object for ${PROVIDER_NAME}:`, deactivateError);
        throw new Error(`Deactivation failed for ${PROVIDER_NAME}: ${deactivateError.message}`);
      }
      deactivatedCount = modelsToDeactivate.length;
    }

    return { provider: PROVIDER_NAME, inserted: insertedCount, updated: updatedCount, deactivated: deactivatedCount };

  } catch (outerError) {
    error(`!!! Sync failed for provider ${PROVIDER_NAME}:`, outerError);
    const errorMessage = outerError instanceof Error ? outerError.message : String(outerError ?? 'Unknown error');
    return { provider: PROVIDER_NAME, inserted: 0, updated: 0, deactivated: 0, error: errorMessage };
  }
} 