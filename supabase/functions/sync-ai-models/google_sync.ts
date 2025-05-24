import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { googleAdapter } from '../_shared/ai_service/google_adapter.ts'; // Import specific adapter
import type { ProviderModelInfo } from '../_shared/types.ts';
// Attempting to import AiModelExtendedConfig from packages. Adjust path if necessary.
// This path assumes supabase/functions/sync-ai-models/ is sibling to a top-level packages/ directory
import type { AiModelExtendedConfig, TiktokenEncoding } from '../_shared/types.ts';
import { getCurrentDbModels as actualGetCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index
import type { Json } from '@paynless/db-types'; // Ensure Json is imported if not already

const PROVIDER_NAME = 'google';

// Helper function to create a default AiModelExtendedConfig
function createDefaultGoogleConfig(modelApiIdentifier?: string): AiModelExtendedConfig {
  const modelId = modelApiIdentifier?.toLowerCase() || '';
  let inputCostRate = 0.0; // Per token
  let outputCostRate = 0.0; // Per token

  // Prices per 1 million tokens, will be converted to per-token rate.
  // Using Vertex AI pricing as a primary source.
  // Gemini 1.5 Pro: Input $1.25/1M (<=128k context), Output $5.00/1M (<=128k context)
  // Gemini 1.5 Flash: Input $0.075/1M (<=128k), Output $0.30/1M (<=128k)
  // Gemini 1.0 Pro (older, often gemini-pro): Input $0.000125/1k chars, Output $0.000375/1k chars
  // Google uses character count for some older models, and token count for newer ones.
  // For simplicity, we will use token-based pricing and assume an approximate char:token ratio if needed,
  // or use token pricing where available (Gemini 1.5+).
  // For models like 'gemini-pro' (older 1.0), let's use its token equivalent pricing if possible or a placeholder.
  // Vertex AI lists Gemini 1.0 Pro (e.g. gemini-1.0-pro-001) as $0.00025/1k input chars, $0.0005/1k output chars (multimodal models)
  // This is different from the text-only pricing. Let's use the multimodal for wider applicability.
  // Assuming 4 chars per token: Input: $0.00025 * 4 = $0.001 per 1k tokens => $1.0/1M tokens
  // Output: $0.0005 * 4 = $0.002 per 1k tokens => $2.0/1M tokens

  if (modelId.includes('gemini-1.5-pro')) {
    inputCostRate = 1.25 / 1000000; // Standard context pricing
    outputCostRate = 5.0 / 1000000; // Standard context pricing
  } else if (modelId.includes('gemini-1.5-flash')) {
    inputCostRate = 0.075 / 1000000; // Standard context pricing
    outputCostRate = 0.30 / 1000000; // Standard context pricing
  } else if (modelId.includes('gemini-pro')) { // Catches gemini-pro, gemini-1.0-pro etc.
    // This is an approximation for older gemini-pro based on character pricing converted
    inputCostRate = 1.0 / 1000000; // Approximated from character based pricing
    outputCostRate = 2.0 / 1000000; // Approximated from character based pricing
  } else {
    // Fallback for other/unknown Google models
    inputCostRate = 0.5 / 1000000; // A generic placeholder
    outputCostRate = 1.5 / 1000000; // A generic placeholder
  }

  return {
    input_token_cost_rate: inputCostRate,
    output_token_cost_rate: outputCostRate,
    tokenization_strategy: {
      type: 'provider_specific_api', // Google uses its own API for token counting
      api_identifier_for_tokenization: modelApiIdentifier, // Pass the model ID
    },
    // context_window_tokens, hard_cap_output_tokens, provider_max_input_tokens, provider_max_output_tokens
    // are expected to be populated from the API response (via googleAdapter) or manual DB override for Google.
    // The sync logic merges these; this function just sets cost defaults.
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
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// Default dependencies using actual implementations
export const defaultSyncGoogleDeps: SyncGoogleDeps = {
  listProviderModels: googleAdapter.listModels,
  getCurrentDbModels: actualGetCurrentDbModels,
  log: console.log,
  error: console.error,
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
          log(`[Diff]     Config changes detected for ${apiIdentifier}:`, newConfig);
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
      try {
          const { error: insertError } = await supabaseClient.from('ai_providers').insert(modelsToInsert);
          if (insertError) {
               error(`Insert resolved with error object for ${PROVIDER_NAME}:`, insertError);
               throw new Error(`Insert failed for ${PROVIDER_NAME}: ${insertError.message}`);
          }
          insertedCount = modelsToInsert.length;
      } catch (err) { // Catch the rejected promise from await
          error(`Insert await threw error for ${PROVIDER_NAME}:`, err);
          const message = err instanceof Error ? err.message : String(err ?? 'Unknown insert error');
          throw new Error(`Insert failed for ${PROVIDER_NAME}: ${message}`);
      }
    }

    if (modelsToUpdate.length > 0) {
      log(`Updating ${modelsToUpdate.length} ${PROVIDER_NAME} models...`);
      try {
          for (const update of modelsToUpdate) {
              const { error: updateError } = await supabaseClient.from('ai_providers').update(update.changes).eq('id', update.id);
              if (updateError) {
                  error(`Update resolved with error object for model ID ${update.id} (${PROVIDER_NAME}):`, updateError);
                  // Throw specific error if promise resolves with error property
                  throw new Error(`Update failed for model ID ${update.id} (${PROVIDER_NAME}): ${updateError.message}`);
              }
          }
          updatedCount = modelsToUpdate.length;
      } catch (err) { // Catch rejection from any update await
           error(`Update await threw error for ${PROVIDER_NAME}:`, err);
           const message = err instanceof Error ? err.message : String(err ?? 'Unknown update error');
           // Throw a slightly more general error message as we might not know the specific failing ID
           throw new Error(`${message}`);
      }
    }

    if (modelsToDeactivate.length > 0) {
      log(`Deactivating ${modelsToDeactivate.length} ${PROVIDER_NAME} models...`);
       try {
            const { error: deactivateError } = await supabaseClient
              .from('ai_providers')
              .update({ is_active: false })
              .in('id', modelsToDeactivate);
            if (deactivateError) {
                error(`Deactivation resolved with error object for ${PROVIDER_NAME}:`, deactivateError);
                throw new Error(`Deactivation failed for ${PROVIDER_NAME}: ${deactivateError.message}`);
            }
            deactivatedCount = modelsToDeactivate.length;
        } catch (err) { // Catch rejection from deactivation await
             error(`Deactivation await threw error for ${PROVIDER_NAME}:`, err);
             const message = err instanceof Error ? err.message : String(err ?? 'Unknown deactivation error');
             throw new Error(`Deactivation failed for ${PROVIDER_NAME}: ${message}`);
        }
    }

    return { provider: PROVIDER_NAME, inserted: insertedCount, updated: updatedCount, deactivated: deactivatedCount };

  } catch (outerError) {
    error(`!!! Sync failed for provider ${PROVIDER_NAME}:`, outerError);
    const errorMessage = outerError instanceof Error ? outerError.message : String(outerError ?? 'Unknown error');
    return { provider: PROVIDER_NAME, inserted: 0, updated: 0, deactivated: 0, error: errorMessage };
  }
} 