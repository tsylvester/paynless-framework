import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { anthropicAdapter } from '../_shared/ai_service/anthropic_adapter.ts'; // Import specific adapter
import type { ProviderModelInfo } from '../_shared/types.ts';
import { getCurrentDbModels as actualGetCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index

const PROVIDER_NAME = 'anthropic';

// --- Dependency Injection Setup ---
// Interface for dependencies required by the sync function
export interface SyncAnthropicDeps {
  listProviderModels: (apiKey: string) => Promise<ProviderModelInfo[]>;
  getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

// Default dependencies using actual implementations
export const defaultSyncAnthropicDeps: SyncAnthropicDeps = {
  listProviderModels: anthropicAdapter.listModels,
  getCurrentDbModels: actualGetCurrentDbModels,
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