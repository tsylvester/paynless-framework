import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAdapter } from '../_shared/ai_service/google_adapter.ts'; // Corrected: Import GoogleAdapter class
import type { ProviderModelInfo, AiModelExtendedConfig, LogMetadata } from '../_shared/types.ts'; // Added LogMetadata
// Attempting to import AiModelExtendedConfig from packages. Adjust path if necessary.
// This path assumes supabase/functions/sync-ai-models/ is sibling to a top-level packages/ directory
// import type { AiModelExtendedConfig } from '../_shared/types.ts'; // This line is redundant due to the import above
import { getCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index
import type { Json } from '@paynless/db-types'; // Ensure Json is imported if not already
import { logger } from '../_shared/logger.ts';

const PROVIDER_NAME = 'google';

// Centralized map for model properties
const modelInfo = {
  'gemini-2.5-pro': { inputCost: 1.25, outputCost: 5.0, context: 8192000, hardCap: 16384 },
  'gemini-2.5-flash': { inputCost: 0.075, outputCost: 0.30, context: 8192000, hardCap: 16384 },
  'gemini-1.5-pro': { inputCost: 1.25, outputCost: 5.0, context: 1048576, hardCap: 8192 },
  'gemini-1.5-flash': { inputCost: 0.075, outputCost: 0.30, context: 1048576, hardCap: 8192 },
  'gemini-pro': { inputCost: 1.0, outputCost: 2.0, context: 32768, hardCap: 2048 },
  // Fallback for any other model
  'default': { inputCost: 0.5, outputCost: 1.5, context: 32768, hardCap: 2048 }
};

// Helper function to create a default AiModelExtendedConfig
export function createDefaultGoogleConfig(modelApiIdentifier: string): AiModelExtendedConfig {
  const modelId = modelApiIdentifier.toLowerCase();
  
  // Find the most specific match, then fallback to broader matches, then to default
  const bestMatchKey = Object.keys(modelInfo).find(key => modelId.includes(key) && key !== 'default') || 'default';
  const info = modelInfo[bestMatchKey as keyof typeof modelInfo];

  const tokenizationStrategy: AiModelExtendedConfig['tokenization_strategy'] = {
    type: 'google_gemini_tokenizer',
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
  // Add more checks for specific properties if needed for robustness
  return true; 
}

// --- Dependency Injection Setup ---
// Interface for dependencies required by the sync function
export interface SyncGoogleDeps {
  listProviderModels: (apiKey: string) => Promise<ProviderModelInfo[]>;
  getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
  log: (message: string, metadata?: LogMetadata) => void; // Use LogMetadata
  error: (message: string, metadata?: LogMetadata) => void; // Use LogMetadata
}

// Default dependencies using actual implementations
export const defaultSyncGoogleDeps: SyncGoogleDeps = {
  listProviderModels: async (apiKey: string): Promise<ProviderModelInfo[]> => {
    // Instantiate the adapter here, as it requires the apiKey and a logger
    const adapter = new GoogleAdapter(apiKey, logger);
    return adapter.listModels();
  },
  getCurrentDbModels: getCurrentDbModels,
  log: (message: string, metadata?: LogMetadata) => logger.info(message, metadata),
  error: (message: string | Error, metadata?: LogMetadata) => logger.error(message, metadata),
};

/**
 * Syncs Google models with the database.
 * Accepts dependencies for testability.
 */
export async function syncGoogleModels(
  supabaseClient: SupabaseClient,
  apiKey: string,
  deps: SyncGoogleDeps = defaultSyncGoogleDeps // Inject dependencies
): Promise<SyncResult> {
  let insertedCount = 0;
  let updatedCount = 0;
  let deactivatedCount = 0;
  const { listProviderModels, getCurrentDbModels, log, error } = deps;

  try {
    // 1. Fetch models from Google API
    log(`Fetching models from ${PROVIDER_NAME} API...`);
    const apiModels = await listProviderModels(apiKey); 
    log(`Fetched ${apiModels.length} models from ${PROVIDER_NAME} API.`);
    const apiModelMap = new Map(apiModels.map(m => [m.api_identifier, m]));

    // 2. Fetch current Google models from DB
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
      
      let apiModelLimits: { provider_max_input_tokens?: number; provider_max_output_tokens?: number } | undefined;
      if (apiModel.config && typeof apiModel.config === 'object') {
        // apiModel.config comes from ProviderModelInfo, which is already an object if populated by the adapter
        apiModelLimits = apiModel.config as { provider_max_input_tokens?: number; provider_max_output_tokens?: number };
      }

      if (dbModel) {
        log(`[Diff]   Found matching DB model (ID: ${dbModel.id}, Active: ${dbModel.is_active}, Config: ${JSON.stringify(dbModel.config)})`);
        const changes: Partial<DbAiProvider> = {};
        if (apiModel.name !== dbModel.name) changes.name = apiModel.name;
        if ((apiModel.description ?? null) !== dbModel.description) changes.description = apiModel.description ?? null;
        if (!dbModel.is_active) changes.is_active = true;

        let baseConfig = createDefaultGoogleConfig(apiIdentifier);
        if (dbModel.config && isPartialAiModelExtendedConfig(dbModel.config)) {
            const parsedDbConfig = dbModel.config; // Already known to be Partial<AiModelExtendedConfig>
            baseConfig = {
                ...baseConfig, // Start with defaults
                ...parsedDbConfig, // Override with stored values
                tokenization_strategy: { // Ensure tokenization_strategy is well-formed
                    ...baseConfig.tokenization_strategy, 
                    ...(parsedDbConfig.tokenization_strategy || {}),
                },
            };
        }
        
        const newConfig: AiModelExtendedConfig = JSON.parse(JSON.stringify(baseConfig)); // Deep clone
        let configChanged = false;

        if (apiModelLimits?.provider_max_input_tokens !== undefined && newConfig.provider_max_input_tokens !== apiModelLimits.provider_max_input_tokens) {
          newConfig.provider_max_input_tokens = apiModelLimits.provider_max_input_tokens;
          configChanged = true;
        }
        if (apiModelLimits?.provider_max_output_tokens !== undefined) {
          if (newConfig.provider_max_output_tokens !== apiModelLimits.provider_max_output_tokens) {
            newConfig.provider_max_output_tokens = apiModelLimits.provider_max_output_tokens;
            configChanged = true;
          }
          if (newConfig.hard_cap_output_tokens === undefined || 
              (typeof newConfig.hard_cap_output_tokens === 'number' && newConfig.hard_cap_output_tokens > apiModelLimits.provider_max_output_tokens) ||
              (baseConfig.provider_max_output_tokens && newConfig.hard_cap_output_tokens === baseConfig.provider_max_output_tokens)
          ) {
            if(newConfig.hard_cap_output_tokens !== apiModelLimits.provider_max_output_tokens) {
                newConfig.hard_cap_output_tokens = apiModelLimits.provider_max_output_tokens;
                configChanged = true;
            }
          }
        }
        
        if (configChanged) {
          changes.config = newConfig as unknown as Json; // Cast to unknown first, then to Json
          log(`[Diff]     Config changes detected for ${apiIdentifier}:`, { config: newConfig });
        }

        if (Object.keys(changes).length > 0) {
          log(`[Diff]     Overall changes for ${apiIdentifier}:`, { changes: changes });
          modelsToUpdate.push({ id: dbModel.id, changes });
        } else {
          log(`[Diff]     No changes detected for ${apiIdentifier}.`);
        }
        dbModelMap.delete(apiIdentifier);
        log(`[Diff]   Removed ${apiIdentifier} from dbModelMap (Remaining size: ${dbModelMap.size})`);
      } else {
        log(`[Diff]   No matching DB model found. Queuing for insert.`);
        const newModelConfig = createDefaultGoogleConfig(apiIdentifier);
        if (apiModelLimits?.provider_max_input_tokens !== undefined) {
          newModelConfig.provider_max_input_tokens = apiModelLimits.provider_max_input_tokens;
        }
        if (apiModelLimits?.provider_max_output_tokens !== undefined) {
          newModelConfig.provider_max_output_tokens = apiModelLimits.provider_max_output_tokens;
          newModelConfig.hard_cap_output_tokens = apiModelLimits.provider_max_output_tokens;
        }

        modelsToInsert.push({
          api_identifier: apiIdentifier,
          name: apiModel.name,
          description: apiModel.description ?? null,
          provider: PROVIDER_NAME,
          config: newModelConfig as unknown as Json, // Cast to unknown first, then to Json
        });
        log(`[Diff]   Queued for insert with config:`, { config: newModelConfig });
      }
    }
    log("--- Finished API model diff ---");

    log(`--- Starting DB model cleanup (Models remaining in dbModelMap: ${dbModelMap.size}) ---`);
    log("[Cleanup] Remaining DB models IDs:", { ids: Array.from(dbModelMap.keys()) });
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
      try {
          const { error: insertError } = await supabaseClient.from('ai_providers').insert(modelsToInsert);
          if (insertError) {
               error(`Insert resolved with error object for ${PROVIDER_NAME}:`, { error: insertError });
               throw new Error(`Insert failed for ${PROVIDER_NAME}: ${insertError.message}`);
          }
          insertedCount = modelsToInsert.length;
      } catch (err) { // Catch the rejected promise from await
          error(`Insert await threw error for ${PROVIDER_NAME}:`, { error: err });
          const message = err instanceof Error ? err.message : String(err ?? 'Unknown insert error');
          throw new Error(`Insert failed for ${PROVIDER_NAME}: ${message}`);
      }
    }

    if (modelsToUpdate.length > 0) {
      log(`Updating ${modelsToUpdate.length} ${PROVIDER_NAME} models...`);
      const errorLogs: string[] = [];
      try {
          for (const update of modelsToUpdate) {
              const { error: updateError } = await supabaseClient.from('ai_providers').update(update.changes).eq('id', update.id);
              if (updateError) {
                  error(`Update resolved with error object for model ID ${update.id} (${PROVIDER_NAME}):`, { error: updateError });
                  // Decide if one failure should stop all: for now, log and continue
                  errorLogs.push(`Update failed for model ID ${update.id}: ${updateError.message}`);
              }
          }
          updatedCount = modelsToUpdate.length - errorLogs.length; // Count successful updates
      } catch (err) { // Catch the rejected promise from the loop itself (e.g. if await not properly handled inside)
          error(`Update await threw error for ${PROVIDER_NAME}:`, { error: err });
          const message = err instanceof Error ? err.message : String(err ?? 'Unknown update error');
          throw new Error(`Update loop failed for ${PROVIDER_NAME}: ${message}`);
      }
    }

    if (modelsToDeactivate.length > 0) {
      log(`Deactivating ${modelsToDeactivate.length} ${PROVIDER_NAME} models...`);
      try {
          const { error: deactivateError } = await supabaseClient.from('ai_providers').update({ is_active: false }).in('id', modelsToDeactivate);
          if (deactivateError) {
              error(`Deactivation resolved with error object for ${PROVIDER_NAME}:`, { error: deactivateError });
              throw new Error(`Deactivation failed for ${PROVIDER_NAME}: ${deactivateError.message}`);
          }
          deactivatedCount = modelsToDeactivate.length;
      } catch (err) { // Catch the rejected promise from await
          error(`Deactivation await threw error for ${PROVIDER_NAME}:`, { error: err });
          const message = err instanceof Error ? err.message : String(err ?? 'Unknown deactivation error');
          throw new Error(`Deactivation failed for ${PROVIDER_NAME}: ${message}`);
      }
    }

    log(`Sync for ${PROVIDER_NAME} completed. Inserted: ${insertedCount}, Updated: ${updatedCount}, Deactivated: ${deactivatedCount}`);
    return { provider: PROVIDER_NAME, inserted: insertedCount, updated: updatedCount, deactivated: deactivatedCount };
  } catch (outerError) {
    error(`!!! Sync failed for provider ${PROVIDER_NAME}:`, { error: outerError });
    const message = outerError instanceof Error ? outerError.message : String(outerError ?? 'Unknown sync error');
    return { provider: PROVIDER_NAME, inserted: 0, updated: 0, deactivated: 0, error: `Sync failed for ${PROVIDER_NAME}: ${message}` };
  }
} 