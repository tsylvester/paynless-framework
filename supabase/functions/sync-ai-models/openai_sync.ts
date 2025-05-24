import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { openAiAdapter } from '../_shared/ai_service/openai_adapter.ts'; // Import specific adapter
import type { ProviderModelInfo } from '../_shared/types.ts';
import type { AiModelExtendedConfig, TiktokenEncoding } from '../_shared/types.ts';
import { getCurrentDbModels as actualGetCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index
import type { Json } from '../types_db.ts';

const PROVIDER_NAME = 'openai';

// Helper function to create a default AiModelExtendedConfig for OpenAI models
function createDefaultOpenAIConfig(modelApiIdentifier: string): AiModelExtendedConfig {
  const modelId = modelApiIdentifier.toLowerCase(); // Normalize to lowercase
  let encodingName: TiktokenEncoding = 'cl100k_base';
  let contextWindow = 4096;  // Default for older or smaller models
  let hardCapOutput = 2048;  // Default, will be overridden
  let providerMaxInput = contextWindow;
  let providerMaxOutput = hardCapOutput;
  let inputCostRate = 0.0;   // Placeholder, will be overridden
  let outputCostRate = 0.0;  // Placeholder, will be overridden
  let isChatMl = true;       // Most current OpenAI models are ChatML

  // Prices per 1 million tokens, convert to per-token rate.
  // gpt-4o: $5 input, $15 output (Docsbot shows $2.5/$10, OpenAI site often shows $5/$15 for 4o)
  // For consistency, using the $5/$15 from OpenAI general pricing pages for gpt-4o
  // gpt-4o-mini: $0.15 input, $0.6 output
  // gpt-4-turbo (e.g., gpt-4-turbo-preview, gpt-4-turbo-2024-04-09): $10 input, $30 output
  // gpt-4: $30 input, $60 output
  // gpt-3.5-turbo (e.g. gpt-3.5-turbo-0125): $0.50 input, $1.50 output

  if (modelId.startsWith('gpt-4o-mini')) {
    encodingName = 'o200k_base';
    contextWindow = 128000;
    hardCapOutput = 16384; // GPT-4o mini has 16k output token limit
    providerMaxInput = 128000;
    providerMaxOutput = 16384;
    inputCostRate = 0.15 / 1000000;
    outputCostRate = 0.6 / 1000000;
  } else if (modelId.startsWith('gpt-4o')) { // Catches gpt-4o, gpt-4o-2024-05-13
    encodingName = 'o200k_base';
    contextWindow = 128000;
    hardCapOutput = 16384; // GPT-4o has 16k output token limit according to OpenAI docs for the model
    providerMaxInput = 128000;
    providerMaxOutput = 16384;
    inputCostRate = 5.0 / 1000000; // Using $5/$15 per million from some OpenAI pages
    outputCostRate = 15.0 / 1000000;
  } else if (modelId.startsWith('gpt-4-turbo') || modelId.includes('-turbo-preview') || modelId.includes('gpt-4-0125-preview') || modelId.includes('gpt-4-1106-preview')) {
    encodingName = 'cl100k_base';
    contextWindow = 128000;
    hardCapOutput = 4096; // Standard for turbo models
    providerMaxInput = 128000;
    providerMaxOutput = 4096;
    inputCostRate = 10.0 / 1000000;
    outputCostRate = 30.0 / 1000000;
  } else if (modelId.startsWith('gpt-4-32k')) {
    encodingName = 'cl100k_base';
    contextWindow = 32768;
    hardCapOutput = 4096; // Max output for gpt-4 is 4096, even for 32k context variant.
    providerMaxInput = 32768;
    providerMaxOutput = 4096;
    inputCostRate = 60.0 / 1000000; // gpt-4-32k is more expensive
    outputCostRate = 120.0 / 1000000;
  } else if (modelId.startsWith('gpt-4')) { // Covers base gpt-4, gpt-4-0613 etc.
    encodingName = 'cl100k_base';
    contextWindow = 8192;
    hardCapOutput = 4096;
    providerMaxInput = 8192;
    providerMaxOutput = 4096;
    inputCostRate = 30.0 / 1000000;
    outputCostRate = 60.0 / 1000000;
  } else if (modelId.startsWith('gpt-3.5-turbo-16k')) {
    encodingName = 'cl100k_base';
    contextWindow = 16385;
    hardCapOutput = 4096;
    providerMaxInput = 16385;
    providerMaxOutput = 4096;
    inputCostRate = 0.5 / 1000000; // Newer 3.5 turbo models are cheaper.
    outputCostRate = 1.5 / 1000000; // Using -0125 pricing as a common baseline for 3.5T
    // Older 3.5 16k models (0613) had $0.003/$0.004, but those are legacy.
  } else if (modelId.startsWith('gpt-3.5-turbo')) { // Covers gpt-3.5-turbo-0125, gpt-3.5-turbo-1106 etc.
    encodingName = 'cl100k_base';
    // Default 3.5-turbo context is 4096, but some specific versions (e.g. -0125) are 16k.
    // The check for 16k is above. If it's a generic 'gpt-3.5-turbo' or non-16k variant:
    if (modelId.includes('1106') || modelId.includes('0125')) { // These specific versions are 16k context
        contextWindow = 16385;
        providerMaxInput = 16385;
    } else {
        contextWindow = 4096;
        providerMaxInput = 4096;
    }
    hardCapOutput = 4096; // Max output for gpt-3.5-turbo is 4096 tokens
    providerMaxOutput = 4096;
    inputCostRate = 0.5 / 1000000;
    outputCostRate = 1.5 / 1000000;
  } else {
    // Fallback for other models (e.g., older models, instruct models if any)
    isChatMl = false; // Non-chat models are not ChatML
    // Use very generic placeholders if unknown model
    inputCostRate = 1.0 / 1000000;
    outputCostRate = 1.0 / 1000000;
  }

  return {
    input_token_cost_rate: inputCostRate,
    output_token_cost_rate: outputCostRate,
    context_window_tokens: contextWindow,
    hard_cap_output_tokens: hardCapOutput, // Our application's hard cap for generation
    tokenization_strategy: {
      type: 'tiktoken',
      tiktoken_encoding_name: encodingName,
      is_chatml_model: isChatMl,
      api_identifier_for_tokenization: modelApiIdentifier, // Pass the model ID for tiktoken library if it can use it
    },
    provider_max_input_tokens: providerMaxInput,
    provider_max_output_tokens: providerMaxOutput,
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
  listProviderModels: openAiAdapter.listModels,
  getCurrentDbModels: actualGetCurrentDbModels, // Use the imported function
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
  deps: SyncOpenAIDeps = defaultSyncOpenAIDeps // Inject dependencies
): Promise<SyncResult> {
  let insertedCount = 0;
  let updatedCount = 0;
  let deactivatedCount = 0;
  // Use injected log/error
  const { listProviderModels, getCurrentDbModels, log, error } = deps;

  try {
    // 1. Fetch models from OpenAI API using injected function
    log(`Fetching models from ${PROVIDER_NAME} API...`);
    const apiModels = await listProviderModels(apiKey); // Use injected function
    log(`Fetched ${apiModels.length} models from ${PROVIDER_NAME} API.`);
    const apiModelMap = new Map(apiModels.map(m => [m.api_identifier, m]));

    // 2. Fetch current OpenAI models from DB using injected function
    const dbModels = await getCurrentDbModels(supabaseClient, PROVIDER_NAME); // Use injected function
    const dbModelMap = new Map<string, DbAiProvider>(
        dbModels.map((m: DbAiProvider) => [m.api_identifier, m])
    );
    
    log(`Found ${dbModels.length} existing DB models for ${PROVIDER_NAME}.`);

    // 3. Determine operations (Logic remains the same)
    const modelsToInsert: Omit<DbAiProvider, 'id' | 'is_active'>[] = [];
    const modelsToUpdate: { id: string; changes: Partial<DbAiProvider> }[] = [];
    const modelsToDeactivate: string[] = [];

    log("--- Starting API model diff ---");
    for (const [apiIdentifier, apiModel] of apiModelMap.entries()) {
      log(`[Diff] Processing API model: ${apiIdentifier}`);
      const dbModel = dbModelMap.get(apiIdentifier);
      if (dbModel) {
        log(`[Diff]   Found matching DB model (ID: ${dbModel.id}, Active: ${dbModel.is_active}, Config: ${JSON.stringify(dbModel.config)})`);
        const changes: Partial<DbAiProvider> = {};
        if (apiModel.name !== dbModel.name) changes.name = apiModel.name;
        if ((apiModel.description ?? null) !== dbModel.description) changes.description = apiModel.description ?? null;
        if (!dbModel.is_active) changes.is_active = true;
        
        let baseConfig = createDefaultOpenAIConfig(apiIdentifier);
        if (dbModel.config && isPartialAiModelExtendedConfig(dbModel.config)) {
            const parsedDbConfig = dbModel.config;
            baseConfig = {
                ...baseConfig, // Start with defaults derived from model ID
                ...parsedDbConfig, // Override with any stored values (manual edits)
                tokenization_strategy: { 
                    ...baseConfig.tokenization_strategy, 
                    ...(parsedDbConfig.tokenization_strategy || {}),
                },
            };
        }
        
        // For OpenAI, apiModel.config will be undefined from listModels.
        // The main purpose of config diffing here is to ensure new models get a default config,
        // or if our createDefaultOpenAIConfig logic changes for a model, it gets updated
        // if no manual config was overriding it.
        // We essentially compare existing dbModel.config to what createDefaultOpenAIConfig would generate now.

        const currentDefaultConfigForModel = createDefaultOpenAIConfig(apiIdentifier);
        let configChanged = false;

        // If there was no config, or if the existing config is different from the current default (e.g. our defaults updated)
        // and it hasn't been manually edited beyond what defaults provide for key strategy fields.
        if (!dbModel.config) {
            changes.config = baseConfig as unknown as Json; // baseConfig already incorporates defaults
            configChanged = true;
            log(`[Diff]     No existing config, applying default for ${apiIdentifier}:`, baseConfig);
        } else {
            // More nuanced check: if fundamental derived properties like encoding or chatML status in default changed,
            // and user hasn't manually overridden them, consider it a change.
            // This example just checks if the stringified versions are different, implying some part of default or manual edit changed.
            // A more robust diff would compare specific fields of interest.
            if (JSON.stringify(dbModel.config) !== JSON.stringify(baseConfig)) {
                 // This will update if manual changes were made, or if baseConfig (derived from defaults) is now different
                 // from what was stored, and those defaults are what we want to enforce or update to.
                changes.config = baseConfig as unknown as Json;
                configChanged = true;
                log(`[Diff]     Config changes (manual or default update) for ${apiIdentifier}:`, baseConfig);
            }
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
        const newModelConfig = createDefaultOpenAIConfig(apiIdentifier);
        modelsToInsert.push({
          api_identifier: apiIdentifier,
          name: apiModel.name,
          description: apiModel.description ?? null,
          provider: PROVIDER_NAME,
          config: newModelConfig as unknown as Json,
        });
        log(`[Diff]   Queued for insert with config:`, newModelConfig);
      }
    }
    log("--- Finished API model diff ---");

    // Any models left in dbModelMap were not in the API response
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

    // 4. Execute DB Operations (Using supabaseClient directly for now)
    if (modelsToInsert.length > 0) {
      log(`Inserting ${modelsToInsert.length} new ${PROVIDER_NAME} models...`);
      const { error: insertError } = await supabaseClient.from('ai_providers').insert(modelsToInsert);
      if (insertError) {
          error(`Insert resolved with error object for ${PROVIDER_NAME}:`, insertError); // Use injected error
          // Throw the error directly to be caught by the outer catch block
          throw new Error(`Insert failed for ${PROVIDER_NAME}: ${insertError.message}`);
      }
      insertedCount = modelsToInsert.length;
    }

    if (modelsToUpdate.length > 0) {
      log(`Updating ${modelsToUpdate.length} ${PROVIDER_NAME} models...`);
      for (const update of modelsToUpdate) {
          const { error: updateError } = await supabaseClient.from('ai_providers').update(update.changes).eq('id', update.id);
          if (updateError) {
              error(`Update resolved with error object for model ID ${update.id} (${PROVIDER_NAME}):`, updateError); // Use injected error
              // Throw the error directly
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
            error(`Deactivation resolved with error object for ${PROVIDER_NAME}:`, deactivateError); // Use injected error
            // Throw the error directly
            throw new Error(`Deactivation failed for ${PROVIDER_NAME}: ${deactivateError.message}`);
        }
        deactivatedCount = modelsToDeactivate.length;
    }

    // If we reach here, all DB operations succeeded
    return { provider: PROVIDER_NAME, inserted: insertedCount, updated: updatedCount, deactivated: deactivatedCount };

  } catch (outerError) { // Outer catch block - Will now catch errors from insert/update/deactivate
    error(`!!! Sync failed for provider ${PROVIDER_NAME}:`, outerError); // Use injected error
    // Correctly extract message: prefer message property if it's an Error or an object with a string message
    let finalErrMsg = 'Unknown error during sync';
    if (outerError instanceof Error) {
      finalErrMsg = outerError.message;
    } else if (typeof outerError === 'object' && outerError !== null && 'message' in outerError && typeof outerError.message === 'string') {
      finalErrMsg = outerError.message;
    } else {
      finalErrMsg = String(outerError ?? finalErrMsg);
    }
    // Ensure the full SyncResult structure is returned on error
    return { provider: PROVIDER_NAME, inserted: 0, updated: 0, deactivated: 0, error: finalErrMsg };
  }
} 