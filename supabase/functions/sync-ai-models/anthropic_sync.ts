import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { AnthropicAdapter } from '../_shared/ai_service/anthropic_adapter.ts'; // Import AnthropicAdapter class
import type { ProviderModelInfo, ILogger } from '../_shared/types.ts'; // Added ILogger
import type { AiModelExtendedConfig } from '../_shared/types.ts';
import { getCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index
import type { Json } from '../types_db.ts'; // Added import

const PROVIDER_NAME = 'anthropic';

// Centralized map for model properties
const modelInfo = {
  'claude-4-sonnet': { inputCost: 3.0, outputCost: 15.0, context: 200000, hardCap: 8192 },
  'claude-3.7-sonnet': { inputCost: 3.0, outputCost: 15.0, context: 200000, hardCap: 8192 },
  'claude-3.5-sonnet': { inputCost: 3.0, outputCost: 15.0, context: 200000, hardCap: 8192 },
  'claude-3-opus': { inputCost: 15.0, outputCost: 75.0, context: 200000, hardCap: 4096 },
  'claude-3-sonnet': { inputCost: 3.0, outputCost: 15.0, context: 200000, hardCap: 4096 },
  'claude-3-haiku': { inputCost: 0.25, outputCost: 1.25, context: 200000, hardCap: 4096 },
  // Fallback for any other model
  'default': { inputCost: 1.0, outputCost: 1.0, context: 200000, hardCap: 4096 }
};

// Helper function to create a default AiModelExtendedConfig for Anthropic models
export function createDefaultAnthropicConfig(modelApiIdentifier: string): AiModelExtendedConfig {
  const modelId = modelApiIdentifier.toLowerCase();
  
  // Find the most specific match, then fallback to broader matches, then to default
  const bestMatchKey = Object.keys(modelInfo).find(key => modelId.includes(key) && key !== 'default') || 'default';
  const info = modelInfo[bestMatchKey as keyof typeof modelInfo];

  const tokenizationStrategy: AiModelExtendedConfig['tokenization_strategy'] = {
    type: 'claude_tokenizer',
  };

  return {
    api_identifier: modelApiIdentifier,
    input_token_cost_rate: info.inputCost / 1000000,
    output_token_cost_rate: info.outputCost / 1000000,
    context_window_tokens: info.context,
    hard_cap_output_tokens: info.hardCap,
    tokenization_strategy: tokenizationStrategy,
    provider_max_input_tokens: info.context,
    provider_max_output_tokens: info.hardCap,
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