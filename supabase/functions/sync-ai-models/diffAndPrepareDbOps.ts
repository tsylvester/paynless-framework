// supabase/functions/sync-ai-models/diffAndPrepareDbOps.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import isEqual from 'npm:fast-deep-equal';
import type { ILogger } from '../_shared/types.ts';
import type { DbAiProvider } from './index.ts';
import type { AssembledModelConfig } from './config_assembler.ts';

export interface DbOpLists {
  modelsToInsert: Omit<DbAiProvider, 'id' | 'is_active'>[];
  modelsToUpdate: { id: string; changes: Partial<DbAiProvider> }[];
  modelsToDeactivate: string[];
}

export interface DbOpResult {
    inserted: number;
    updated: number;
    deactivated: number;
}

/**
 * Compares the assembled model configurations with the current state in the database
 * and determines the necessary insert, update, and deactivate operations.
 * @param assembledConfigs - The list of fully configured models from the ConfigAssembler.
 * @param dbModels - The list of models currently in the database for the provider.
 * @param providerName - The name of the provider (e.g., 'openai').
 * @param logger - An ILogger instance for logging.
 * @returns An object containing lists of models for each database operation.
 */
export function diffAndPrepareDbOps(
    assembledConfigs: AssembledModelConfig[],
    dbModels: DbAiProvider[],
    providerName: string,
    logger: ILogger,
): DbOpLists {
    const modelsToInsert: Omit<DbAiProvider, 'id' | 'is_active'>[] = [];
    const modelsToUpdate: { id: string; changes: Partial<DbAiProvider> }[] = [];
    
    const dbModelMap = new Map<string, DbAiProvider>(dbModels.map(m => [m.api_identifier, m]));
    const assembledConfigMap = new Map<string, AssembledModelConfig>(assembledConfigs.map(m => [m.api_identifier, m]));

    logger.info(`--- [Diff] Starting diff for ${providerName} ---`);
    logger.info(`[Diff] ${assembledConfigMap.size} assembled models vs. ${dbModelMap.size} DB models.`);

    for (const [apiIdentifier, assembledModel] of assembledConfigMap.entries()) {
        const dbModel = dbModelMap.get(apiIdentifier);

        if (dbModel) {
            // Model exists in DB, check for updates
            const changes: Partial<DbAiProvider> = {};
            if (assembledModel.name !== dbModel.name) {
                changes.name = assembledModel.name;
            }
            if ((assembledModel.description ?? null) !== dbModel.description) {
                changes.description = assembledModel.description ?? null;
            }
            if (!dbModel.is_active) {
                changes.is_active = true; // Reactivate
            }
            if (!isEqual(assembledModel.config, dbModel.config)) {
                changes.config = assembledModel.config;
            }

            if (Object.keys(changes).length > 0) {
                logger.info(`[Diff] Queuing update for ${apiIdentifier}:`, changes);
                modelsToUpdate.push({ id: dbModel.id, changes });
            }
            
            dbModelMap.delete(apiIdentifier); // Mark as handled
        } else {
            // New model, queue for insert
            logger.info(`[Diff] Queuing insert for new model ${apiIdentifier}`);
            modelsToInsert.push({
                api_identifier: apiIdentifier,
                name: assembledModel.name,
                description: assembledModel.description ?? null,
                provider: providerName,
                config: assembledModel.config,
            });
        }
    }

    // Any remaining models in dbModelMap were not in the assembled list, so deactivate them.
    const modelsToDeactivate: string[] = Array.from(dbModelMap.values())
        .filter(dbModel => dbModel.is_active)
        .map(dbModel => dbModel.id);
        
    logger.info(`[Diff] Queuing ${modelsToDeactivate.length} models for deactivation.`);
    logger.info(`--- [Diff] Finished diff for ${providerName} ---`);

    return { modelsToInsert, modelsToUpdate, modelsToDeactivate };
}

/**
 * Executes the database operations (insert, update, deactivate) determined by the diff.
 */
export async function executeDbOps(
    supabaseClient: SupabaseClient,
    providerName: string,
    ops: DbOpLists,
    logger: ILogger,
): Promise<DbOpResult> {
    const { modelsToInsert, modelsToUpdate, modelsToDeactivate } = ops;
    let insertedCount = 0;
    let updatedCount = 0;
    let deactivatedCount = 0;

    if (modelsToInsert.length > 0) {
      logger.info(`[DB] Inserting ${modelsToInsert.length} new ${providerName} models...`);
      const { error: insertError } = await supabaseClient.from('ai_providers').insert(modelsToInsert);
      if (insertError) throw new Error(`Insert failed for ${providerName}: ${insertError.message}`);
      insertedCount = modelsToInsert.length;
    }

    if (modelsToUpdate.length > 0) {
      logger.info(`[DB] Updating ${modelsToUpdate.length} ${providerName} models...`);
      for (const update of modelsToUpdate) {
          const { error: updateError } = await supabaseClient.from('ai_providers').update(update.changes).eq('id', update.id);
          if (updateError) throw new Error(`Update failed for model ID ${update.id} (${providerName}): ${updateError.message}`);
      }
      updatedCount = modelsToUpdate.length;
    }

    if (modelsToDeactivate.length > 0) {
      logger.info(`[DB] Deactivating ${modelsToDeactivate.length} ${providerName} models...`);
      const { error: deactivateError } = await supabaseClient.from('ai_providers').update({ is_active: false }).in('id', modelsToDeactivate);
      if (deactivateError) throw new Error(`Deactivation failed for ${providerName}: ${deactivateError.message}`);
      deactivatedCount = modelsToDeactivate.length;
    }

    return { inserted: insertedCount, updated: updatedCount, deactivated: deactivatedCount };
}
