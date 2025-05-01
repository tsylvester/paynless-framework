import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { openAiAdapter } from '../_shared/ai_service/openai_adapter.ts'; // Import specific adapter
import type { ProviderModelInfo } from '../_shared/types.ts';
import { getCurrentDbModels as actualGetCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index

const PROVIDER_NAME = 'openai';

// --- Dependency Injection Setup ---
// Interface for dependencies required by the sync function
export interface SyncOpenAIDeps {
  listProviderModels: (apiKey: string) => Promise<ProviderModelInfo[]>;
  getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
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
        log(`[Diff]   Found matching DB model (ID: ${dbModel.id}, Active: ${dbModel.is_active})`);
        const changes: Partial<DbAiProvider> = {};
        if (apiModel.name !== dbModel.name) changes.name = apiModel.name;
        if ((apiModel.description ?? null) !== dbModel.description) changes.description = apiModel.description ?? null;
        if (!dbModel.is_active) changes.is_active = true; // Reactivate if found in API but was inactive
        
        if (Object.keys(changes).length > 0) {
           log(`[Diff]     Changes detected:`, changes);
           modelsToUpdate.push({ id: dbModel.id, changes });
        } else {
            log(`[Diff]     No changes detected.`);
        }
        // Remove processed model from dbModelMap
        dbModelMap.delete(apiIdentifier);
        log(`[Diff]   Removed ${apiIdentifier} from dbModelMap (Remaining size: ${dbModelMap.size})`);
      } else {
        log(`[Diff]   No matching DB model found. Queuing for insert.`);
        modelsToInsert.push({
          api_identifier: apiIdentifier,
          name: apiModel.name,
          description: apiModel.description ?? null,
          provider: PROVIDER_NAME,
        });
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