import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { anthropicAdapter } from '../_shared/ai_service/anthropic_adapter.ts'; // Import specific adapter
import { getCurrentDbModels, type SyncResult, type DbAiProvider } from './index.ts'; // Import shared helper and types from main index

const PROVIDER_NAME = 'anthropic';

/**
 * Syncs Anthropic models with the database.
 */
export async function syncAnthropicModels(supabaseClient: SupabaseClient, apiKey: string): Promise<SyncResult> {
  let insertedCount = 0;
  let updatedCount = 0;
  let deactivatedCount = 0;

  try {
    // 1. Fetch models from Anthropic API
    console.log(`Fetching models from ${PROVIDER_NAME} API...`);
    const apiModels = await anthropicAdapter.listModels(apiKey);
    console.log(`Fetched ${apiModels.length} models from ${PROVIDER_NAME} API.`);
    const apiModelMap = new Map(apiModels.map(m => [m.api_identifier, m]));

    // 2. Fetch current Anthropic models from DB
    const dbModels = await getCurrentDbModels(supabaseClient, PROVIDER_NAME);
    const dbModelMap = new Map<string, DbAiProvider>(
        dbModels.map((m: DbAiProvider) => [m.api_identifier, m])
    );
    console.log(`Found ${dbModels.length} existing DB models for ${PROVIDER_NAME}.`);

    // 3. Determine operations
    const modelsToInsert: Omit<DbAiProvider, 'id' | 'is_active'>[] = [];
    const modelsToUpdate: { id: string; changes: Partial<DbAiProvider> }[] = [];
    const modelsToDeactivate: string[] = [];

    for (const [apiIdentifier, apiModel] of apiModelMap.entries()) {
      const dbModel = dbModelMap.get(apiIdentifier);
      if (dbModel) {
        const changes: Partial<DbAiProvider> = {};
        if (apiModel.name !== dbModel.name) changes.name = apiModel.name;
        if ((apiModel.description ?? null) !== dbModel.description) changes.description = apiModel.description ?? null;
        if (!dbModel.is_active) changes.is_active = true;
        if (Object.keys(changes).length > 0) {
          modelsToUpdate.push({ id: dbModel.id, changes });
        }
        dbModelMap.delete(apiIdentifier);
      } else {
        modelsToInsert.push({
          api_identifier: apiIdentifier,
          name: apiModel.name,
          description: apiModel.description ?? null,
          provider: PROVIDER_NAME,
        });
      }
    }

    for (const dbModel of dbModelMap.values()) {
      if (dbModel.is_active) {
        modelsToDeactivate.push(dbModel.id);
      }
    }

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
    return { provider: PROVIDER_NAME, inserted: 0, updated: 0, deactivated: 0, error: errorMessage };
  }
} 