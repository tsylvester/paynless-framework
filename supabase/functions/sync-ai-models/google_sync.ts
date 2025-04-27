import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { googleAdapter } from '../_shared/ai_service/google_adapter.ts'; // Import specific adapter
import type { ProviderModelInfo } from '../_shared/types.ts';
import { getCurrentDbModels as actualGetCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index

const PROVIDER_NAME = 'google';

// --- Dependency Injection Setup ---
// Interface for dependencies required by the sync function
export interface SyncGoogleDeps {
  listProviderModels: (apiKey: string) => Promise<ProviderModelInfo[]>;
  getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
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
      if (dbModel) {
        log(`[Diff]   Found matching DB model (ID: ${dbModel.id}, Active: ${dbModel.is_active})`);
        const changes: Partial<DbAiProvider> = {};
        if (apiModel.name !== dbModel.name) changes.name = apiModel.name;
        if ((apiModel.description ?? null) !== dbModel.description) changes.description = apiModel.description ?? null;
        if (!dbModel.is_active) changes.is_active = true;
        if (Object.keys(changes).length > 0) {
          log(`[Diff]     Changes detected:`, changes);
          modelsToUpdate.push({ id: dbModel.id, changes });
        } else {
          log(`[Diff]     No changes detected.`);
        }
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
           throw new Error(`Update process failed for ${PROVIDER_NAME}: ${message}`);
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