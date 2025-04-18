import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { openAiAdapter } from '../_shared/ai_service/openai_adapter.ts'; // Import specific adapter
import { getCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index

const PROVIDER_NAME = 'openai';

/**
 * Syncs OpenAI models with the database.
 */
export async function syncOpenAIModels(supabaseClient: SupabaseClient, apiKey: string): Promise<SyncResult> {
  let insertedCount = 0;
  let updatedCount = 0;
  let deactivatedCount = 0;

  try {
    // 1. Fetch models from OpenAI API
    console.log(`Fetching models from ${PROVIDER_NAME} API...`);
    const apiModels = await openAiAdapter.listModels(apiKey); // Use the specific adapter
    console.log(`Fetched ${apiModels.length} models from ${PROVIDER_NAME} API.`);
    const apiModelMap = new Map(apiModels.map(m => [m.api_identifier, m]));

    // 2. Fetch current OpenAI models from DB
    const dbModels = await getCurrentDbModels(supabaseClient, PROVIDER_NAME);
    const dbModelMap = new Map<string, DbAiProvider>(
        dbModels.map((m: DbAiProvider) => [m.api_identifier, m])
    );
    console.log(`Found ${dbModels.length} existing DB models for ${PROVIDER_NAME}.`);

    // 3. Determine operations (Identical logic as the previous generic function)
    const modelsToInsert: Omit<DbAiProvider, 'id' | 'is_active'>[] = [];
    const modelsToUpdate: { id: string; changes: Partial<DbAiProvider> }[] = [];
    const modelsToDeactivate: string[] = [];

    console.log("--- Starting API model diff ---");
    for (const [apiIdentifier, apiModel] of apiModelMap.entries()) {
      console.log(`[Diff] Processing API model: ${apiIdentifier}`);
      const dbModel = dbModelMap.get(apiIdentifier);
      if (dbModel) {
        console.log(`[Diff]   Found matching DB model (ID: ${dbModel.id}, Active: ${dbModel.is_active})`);
        const changes: Partial<DbAiProvider> = {};
        if (apiModel.name !== dbModel.name) changes.name = apiModel.name;
        if ((apiModel.description ?? null) !== dbModel.description) changes.description = apiModel.description ?? null;
        if (!dbModel.is_active) changes.is_active = true; // Reactivate if found in API but was inactive
        
        if (Object.keys(changes).length > 0) {
           console.log(`[Diff]     Changes detected:`, changes);
           modelsToUpdate.push({ id: dbModel.id, changes });
        } else {
            console.log(`[Diff]     No changes detected.`);
        }
        // Remove processed model from dbModelMap
        dbModelMap.delete(apiIdentifier);
        console.log(`[Diff]   Removed ${apiIdentifier} from dbModelMap (Remaining size: ${dbModelMap.size})`);
      } else {
        console.log(`[Diff]   No matching DB model found. Queuing for insert.`);
        modelsToInsert.push({
          api_identifier: apiIdentifier,
          name: apiModel.name,
          description: apiModel.description ?? null,
          provider: PROVIDER_NAME,
        });
      }
    }
    console.log("--- Finished API model diff ---");

    // Any models left in dbModelMap were not in the API response
    console.log(`--- Starting DB model cleanup (Models remaining in dbModelMap: ${dbModelMap.size}) ---`);
    console.log("[Cleanup] Remaining DB models IDs:", Array.from(dbModelMap.keys()));
    for (const dbModel of dbModelMap.values()) {
       console.log(`[Cleanup] Processing remaining DB model: ${dbModel.api_identifier} (ID: ${dbModel.id}, Active: ${dbModel.is_active})`);
      if (dbModel.is_active) {
        console.log(`[Cleanup]   Model is active. Queuing for deactivation.`);
        modelsToDeactivate.push(dbModel.id);
      } else {
          console.log(`[Cleanup]   Model is already inactive. Skipping.`);
      }
    }
    console.log("--- Finished DB model cleanup ---");

    // 4. Execute DB Operations
    if (modelsToInsert.length > 0) {
      console.log(`Inserting ${modelsToInsert.length} new ${PROVIDER_NAME} models...`);
      const { error } = await supabaseClient.from('ai_providers').insert(modelsToInsert);
      if (error) throw new Error(`Insert failed for ${PROVIDER_NAME}: ${error.message}`);
      insertedCount = modelsToInsert.length;
    }

    if (modelsToUpdate.length > 0) {
      console.log(`Updating ${modelsToUpdate.length} ${PROVIDER_NAME} models...`);
      for (const update of modelsToUpdate) {
        const { error } = await supabaseClient.from('ai_providers').update(update.changes).eq('id', update.id);
        if (error) throw new Error(`Update failed for model ID ${update.id} (${PROVIDER_NAME}): ${error.message}`);
      }
      updatedCount = modelsToUpdate.length;
    }

    if (modelsToDeactivate.length > 0) {
      console.log(`Deactivating ${modelsToDeactivate.length} ${PROVIDER_NAME} models...`);
      const { error } = await supabaseClient
        .from('ai_providers')
        .update({ is_active: false })
        .in('id', modelsToDeactivate);
      if (error) throw new Error(`Deactivation failed for ${PROVIDER_NAME}: ${error.message}`);
      deactivatedCount = modelsToDeactivate.length;
    }

    return { provider: PROVIDER_NAME, inserted: insertedCount, updated: updatedCount, deactivated: deactivatedCount };

  } catch (error) {
    console.error(`!!! Sync failed for provider ${PROVIDER_NAME}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    // Ensure the full SyncResult structure is returned on error
    return { provider: PROVIDER_NAME, inserted: 0, updated: 0, deactivated: 0, error: errorMessage };
  }
} 