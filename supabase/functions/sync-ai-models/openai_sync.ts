import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { OpenAiAdapter } from '../_shared/ai_service/openai_adapter.ts'; // Import OpenAiAdapter class
import type { ProviderModelInfo, ILogger } from '../_shared/types.ts'; // Added ILogger
import type { AiModelExtendedConfig } from '../_shared/types.ts';
import { getCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index
import type { Json } from '../types_db.ts';

const PROVIDER_NAME = 'openai';

// Helper function to create a default AiModelExtendedConfig for OpenAI models
export function createDefaultOpenAIConfig(modelApiIdentifier: string): Partial<AiModelExtendedConfig> {
  const modelId = modelApiIdentifier.replace(/^openai-/i, ''); // Raw model ID for cost lookup and tokenization
  let inputCostRate = 0.0;
  let outputCostRate = 0.0;

  // --- Cost Rate Logic (Paynless-specific, keep this part) ---
  // Prices per 1 million tokens, convert to per-token rate.
  if (modelId.startsWith('gpt-4o-mini')) {
    inputCostRate = 0.15 / 1000000;
    outputCostRate = 0.6 / 1000000;
  } else if (modelId.startsWith('gpt-4o')) {
    inputCostRate = 5.0 / 1000000;
    outputCostRate = 15.0 / 1000000;
  } else if (modelId.startsWith('gpt-4-turbo') || modelId.includes('-turbo-preview') || modelId.includes('gpt-4-0125-preview') || modelId.includes('gpt-4-1106-preview')) {
    inputCostRate = 10.0 / 1000000;
    outputCostRate = 30.0 / 1000000;
  } else if (modelId.startsWith('gpt-4-32k')) {
    inputCostRate = 60.0 / 1000000;
    outputCostRate = 120.0 / 1000000;
  } else if (modelId.startsWith('gpt-4')) {
    inputCostRate = 30.0 / 1000000;
    outputCostRate = 60.0 / 1000000;
  } else if (modelId.startsWith('gpt-3.5-turbo-16k')) {
    inputCostRate = 0.5 / 1000000;
    outputCostRate = 1.5 / 1000000;
  } else if (modelId.startsWith('gpt-3.5-turbo')) {
    // Specific versions like -0125 are 16k, but general cost is the same.
    inputCostRate = 0.5 / 1000000;
    outputCostRate = 1.5 / 1000000;
  } else {
    // Fallback for other/unknown models - minimal cost
    inputCostRate = 0.1 / 1000000; // Cheaper placeholder
    outputCostRate = 0.1 / 1000000; // Cheaper placeholder
  }
  // --- END Cost Rate Logic ---

  // Provide a generic, valid default tokenization strategy.
  // Tiktoken library will use the modelId to apply specific rules.
  const defaultTokenizationStrategy: AiModelExtendedConfig['tokenization_strategy'] = {
    type: 'tiktoken',
    tiktoken_encoding_name: 'cl100k_base', // A common default, tiktoken may override based on modelId
    is_chatml_model: true, // Most modern OpenAI models are ChatML, tiktoken may adjust
    api_identifier_for_tokenization: modelId, // Essential for tiktoken to identify the model
  };

  return {
    api_identifier: modelApiIdentifier, // Crucial for linking
    input_token_cost_rate: inputCostRate,
    output_token_cost_rate: outputCostRate,
    tokenization_strategy: defaultTokenizationStrategy,
    // Fields like context_window_tokens, provider_max_input_tokens, provider_max_output_tokens,
    // and hard_cap_output_tokens are NOT set here. They will come from:
    // 1. OpenAI API (via adapter) if available (e.g., context_window_tokens).
    // 2. Existing values in the database (manual overrides).
    // 3. The merge logic in syncOpenAIModels will handle combining these sources.
  };
}

function isPartialAiModelExtendedConfig(obj: unknown): obj is Partial<AiModelExtendedConfig> {
  if (typeof obj !== 'object' || obj === null) return false;
  return true; 
}

// --- Dependency Injection Setup ---
// Interface for dependencies required by the sync function
export interface SyncOpenAIDeps {
  listProviderModels: (apiKey: string) => Promise<ProviderModelInfo[]>;
  getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  // SupabaseClient is passed separately for now, but could be included here
}

// Default dependencies using actual implementations
export const defaultSyncOpenAIDeps: SyncOpenAIDeps = {
  listProviderModels: async (apiKey: string): Promise<ProviderModelInfo[]> => {
    const logger: ILogger = {
      debug: (...args: unknown[]) => console.debug('[SyncOpenAI:OpenAiAdapter]', ...args),
      info: (...args: unknown[]) => console.info('[SyncOpenAI:OpenAiAdapter]', ...args),
      warn: (...args: unknown[]) => console.warn('[SyncOpenAI:OpenAiAdapter]', ...args),
      error: (...args: unknown[]) => console.error('[SyncOpenAI:OpenAiAdapter]', ...args),
    };
    const adapter = new OpenAiAdapter(apiKey, logger);
    return adapter.listModels();
  },
  getCurrentDbModels: getCurrentDbModels, // Use the imported function
  log: console.log,
  error: console.error,
};

/**
 * Syncs OpenAI models with the database.
 * Accepts dependencies for testability.
 */
export async function syncOpenAIModels(
  supabaseClient: SupabaseClient, 
  apiKey: string,
  deps: SyncOpenAIDeps = defaultSyncOpenAIDeps
): Promise<SyncResult> {
  let insertedCount = 0;
  let updatedCount = 0;
  let deactivatedCount = 0;
  const { listProviderModels, getCurrentDbModels, log, error } = deps;

  try {
    log(`Fetching models from ${PROVIDER_NAME} API...`);
    const apiModels = await listProviderModels(apiKey);
    log(`Fetched ${apiModels.length} models from ${PROVIDER_NAME} API.`);
    const apiModelMap = new Map(apiModels.map(m => [m.api_identifier, m]));

    const dbModels = await getCurrentDbModels(supabaseClient, PROVIDER_NAME);
    const dbModelMap = new Map<string, DbAiProvider>(
        dbModels.map((m: DbAiProvider) => [m.api_identifier, m])
    );
    log(`Found ${dbModels.length} existing DB models for ${PROVIDER_NAME}.`);

    const modelsToInsert: Omit<DbAiProvider, 'id' | 'is_active'>[] = [];
    const modelsToUpdate: { id: string; changes: Partial<DbAiProvider> }[] = [];
    const modelsToDeactivate: string[] = [];

    log("--- Starting API model diff ---");
    for (const [apiIdentifier, apiModel] of apiModelMap.entries()) {
      log(`[Diff] Processing API model: ${apiIdentifier}`);
      const dbModel = dbModelMap.get(apiIdentifier);

      const defaultConfig = createDefaultOpenAIConfig(apiIdentifier);
      const apiProvidedConfig = (apiModel.config || {}) as Partial<AiModelExtendedConfig>;

      if (dbModel) {
        log(`[Diff]   Found matching DB model (ID: ${dbModel.id}, Active: ${dbModel.is_active}, Config: ${JSON.stringify(dbModel.config)})`);
        const changes: Partial<DbAiProvider> = {};
        if (apiModel.name !== dbModel.name) changes.name = apiModel.name;
        if ((apiModel.description ?? null) !== dbModel.description) changes.description = apiModel.description ?? null;
        if (!dbModel.is_active) changes.is_active = true;
        
        const databaseSavedConfig = (dbModel.config && isPartialAiModelExtendedConfig(dbModel.config) ? dbModel.config : {}) as Partial<AiModelExtendedConfig>;

        // Start with defaults, layer API-provided info, then layer DB saved info for top-level fields
        const mergedConfigCandidate: Partial<AiModelExtendedConfig> = {
          ...defaultConfig,       // Default costs, default tokenization_strategy
          ...apiProvidedConfig,   // API context_window etc. (adapter currently doesn't set tokenization_strategy)
          ...databaseSavedConfig, // DB overrides for any field
        };

        // Carefully merge tokenization_strategy, respecting discriminated union type
        let finalTokenizationStrategy = defaultConfig.tokenization_strategy; // This is a full default object

        if (apiProvidedConfig.tokenization_strategy) { // Adapter unlikely to provide this for OpenAI
          if (finalTokenizationStrategy && apiProvidedConfig.tokenization_strategy.type === finalTokenizationStrategy.type) {
            finalTokenizationStrategy = { ...finalTokenizationStrategy, ...apiProvidedConfig.tokenization_strategy };
          } else {
            finalTokenizationStrategy = apiProvidedConfig.tokenization_strategy; // Replace if type differs or initial was undefined
          }
        }

        if (databaseSavedConfig.tokenization_strategy) {
          if (finalTokenizationStrategy && databaseSavedConfig.tokenization_strategy.type === finalTokenizationStrategy.type) {
            finalTokenizationStrategy = { ...finalTokenizationStrategy, ...databaseSavedConfig.tokenization_strategy };
          } else {
            finalTokenizationStrategy = databaseSavedConfig.tokenization_strategy; // Replace if type differs or initial was undefined
          }
        }
        mergedConfigCandidate.tokenization_strategy = finalTokenizationStrategy;

        // Check if the newly constructed config is different from what's in the DB
        // This check also handles the case where dbModel.config was initially null/undefined
        if (JSON.stringify(dbModel.config) !== JSON.stringify(mergedConfigCandidate)) {
          changes.config = mergedConfigCandidate as unknown as Json;
          log(`[Diff]     Config changes for ${apiIdentifier}:`, mergedConfigCandidate);
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
        // New model: Merge defaults with API-provided info
        const newModelConfigCandidate: Partial<AiModelExtendedConfig> = {
          ...defaultConfig,       // Default costs, default tokenization_strategy
          ...apiProvidedConfig,   // API context_window etc.
        };

        // Carefully merge tokenization_strategy for new model
        let finalTokenizationStrategy = defaultConfig.tokenization_strategy;
        if (apiProvidedConfig.tokenization_strategy) { // Adapter unlikely to provide this
           if (finalTokenizationStrategy && apiProvidedConfig.tokenization_strategy.type === finalTokenizationStrategy.type) {
            finalTokenizationStrategy = { ...finalTokenizationStrategy, ...apiProvidedConfig.tokenization_strategy };
          } else {
            finalTokenizationStrategy = apiProvidedConfig.tokenization_strategy;
          }
        }
        newModelConfigCandidate.tokenization_strategy = finalTokenizationStrategy;
        
        modelsToInsert.push({
          api_identifier: apiIdentifier,
          name: apiModel.name,
          description: apiModel.description ?? null,
          provider: PROVIDER_NAME,
          config: newModelConfigCandidate as unknown as Json,
        });
        log(`[Diff]   Queued for insert with config:`, newModelConfigCandidate);
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
    let finalErrMsg = 'Unknown error during sync';
    if (outerError instanceof Error) {
      finalErrMsg = outerError.message;
    } else if (typeof outerError === 'object' && outerError !== null && 'message' in outerError && typeof outerError.message === 'string') {
      finalErrMsg = outerError.message;
    } else {
      finalErrMsg = String(outerError ?? finalErrMsg);
    }
    return { provider: PROVIDER_NAME, inserted: 0, updated: 0, deactivated: 0, error: finalErrMsg };
  }
} 