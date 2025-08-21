// supabase/functions/sync-ai-models/diffAndPrepareDbOps.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import isEqual from 'npm:fast-deep-equal';
import type { ILogger, FinalAppModelConfig } from '../_shared/types.ts';
import type { DbAiProvider } from './index.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import { AiModelExtendedConfigSchema } from '../chat/zodSchema.ts';
import type { AiModelExtendedConfig } from '../_shared/types.ts';

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
    assembledConfigs: FinalAppModelConfig[],
    dbModels: DbAiProvider[],
    providerName: string,
    logger: ILogger,
): DbOpLists {
    const modelsToInsert: Omit<DbAiProvider, 'id' | 'is_active'>[] = [];
    const modelsToUpdate: { id: string; changes: Partial<DbAiProvider> }[] = [];
    const modelsToDeactivate: string[] = [];
    
    const dbModelMap = new Map<string, DbAiProvider>(dbModels.map(m => [m.api_identifier, m]));
    const assembledConfigMap = new Map<string, FinalAppModelConfig>(assembledConfigs.map(m => [m.api_identifier, m]));

    logger.info(`--- [Diff] Starting diff for ${providerName} ---`);
    logger.info(`[Diff] ${assembledConfigMap.size} assembled models vs. ${dbModelMap.size} DB models.`);

    for (const [apiIdentifier, assembledModel] of assembledConfigMap.entries()) {
        const dbModel = dbModelMap.get(apiIdentifier);

        // --- VALIDATE ASSEMBLED CONFIG ---
        const assembledValidation = AiModelExtendedConfigSchema.safeParse(assembledModel.config);

        if (dbModel) {
            // --- EXISTING MODEL LOGIC ---

            // Explicitly check for a null config first. This is a critical data error
            // that must be repaired immediately.
            if (dbModel.config === null) {
                logger.warn(`[Diff] Database config for ${apiIdentifier} is NULL. Forcing repair.`);
                if (assembledValidation.success && isJson(assembledModel.config)) {
                    modelsToUpdate.push({
                        id: dbModel.id,
                        changes: {
                            name: assembledModel.name,
                            description: assembledModel.description ?? null,
                            is_active: true,
                            config: assembledModel.config
                        },
                    });
                } else {
                     logger.error(`[Diff] Cannot repair NULL config for ${apiIdentifier} because assembled config is invalid or not JSON.`);
                }
                dbModelMap.delete(apiIdentifier);
                continue; // Move to the next model
            }

            const dbValidation = AiModelExtendedConfigSchema.safeParse(dbModel.config);
            logger.info(`[DEBUG] Processing ${apiIdentifier}`, { 
                dbModelExists: true, 
                dbValidationSuccess: dbValidation.success, 
                assembledValidationSuccess: assembledValidation.success 
            });
            
            if (!dbValidation.success) {
                // The database config is INVALID. This is the highest priority to fix.
                logger.warn(`[Diff] Database config for ${apiIdentifier} is INVALID. Forcing repair/update.`, { error: dbValidation.error.format() });
                
                if (assembledValidation.success) {
                    // We have a valid assembled config, so we can perform a full repair.
                    if (isJson(assembledModel.config)) {
                        modelsToUpdate.push({
                            id: dbModel.id,
                            changes: { 
                                name: assembledModel.name,
                                description: assembledModel.description ?? null,
                                is_active: true,
                                config: assembledModel.config
                            },
                        });
                    } else {
                        logger.error(`[Diff] Assembled config for ${apiIdentifier} is not valid JSON, cannot use for repair.`);
                    }
                    // The model was repairable and has been updated, so we remove it from the map.
                    dbModelMap.delete(apiIdentifier);
                } else {
                    // Both configs are invalid. Cannot repair.
                    // Queue an UPDATE that deactivates the model AND sanitizes its config.
                    logger.error(`[Diff] BOTH DB and assembled configs for ${apiIdentifier} are INVALID. Deactivating and sanitizing model.`, { assembledError: assembledValidation.error?.format(), dbError: dbValidation.error.format() });
                    
                    // Create a failsafe, valid config to scrub the invalid one from the DB.
                    const failsafeConfig: AiModelExtendedConfig = {
                        api_identifier: dbModel.api_identifier,
                        input_token_cost_rate: null,
                        output_token_cost_rate: null,
                        context_window_tokens: null,
                        hard_cap_output_tokens: 1, // Must be a positive number
                        tokenization_strategy: { type: 'rough_char_count', chars_per_token_ratio: 4 },
                    };

                    if (isJson(failsafeConfig)) {
                        modelsToUpdate.push({
                            id: dbModel.id,
                            changes: { 
                                is_active: false,
                                config: failsafeConfig,
                                description: `[SANITIZED]: ${dbModel.description ?? 'No description.'}`
                            },
                        });
                    } else {
                        // This should be an unreachable state, but we log it as a critical failure if it ever occurs.
                        logger.error(`[Diff] CRITICAL FAILURE: Failsafe config for ${dbModel.api_identifier} is not valid JSON. Cannot sanitize.`);
                    }

                    dbModelMap.delete(apiIdentifier);
                }
            } else if (!assembledValidation.success) {
                // The database config is VALID, but the assembled one is NOT.
                // This is a critical error in the configuration pipeline, but we MUST NOT
                // do anything to the DB. Log the error and mark as handled so it won't be deactivated.
                logger.error(`[Diff] Assembled config for ${apiIdentifier} is INVALID, but DB config is valid. SKIPPING update to prevent corruption.`, { error: assembledValidation.error.format() });
                dbModelMap.delete(apiIdentifier);
            } else {
                // Both configs are VALID. Compare for standard changes.
                const changes: Partial<DbAiProvider> = {};
                if (assembledModel.name !== dbModel.name) changes.name = assembledModel.name;
                if ((assembledModel.description ?? null) !== dbModel.description) changes.description = assembledModel.description ?? null;
                if (!dbModel.is_active) changes.is_active = true;
                if (!isEqual(assembledModel.config, dbModel.config)) {
                    if (isJson(assembledModel.config)) {
                        changes.config = assembledModel.config;
                    }
                }
                if (Object.keys(changes).length > 0) {
                    logger.info(`[Diff] Queuing update for ${apiIdentifier}:`, changes);
                    modelsToUpdate.push({ id: dbModel.id, changes });
                }
                dbModelMap.delete(apiIdentifier); // Mark model as handled
            }
        } else {
            logger.info(`[DEBUG] Processing ${apiIdentifier}`, { 
                dbModelExists: false, 
                assembledValidationSuccess: assembledValidation.success 
            });
            // --- NEW MODEL LOGIC ---
            if (assembledValidation.success) {
                if (isJson(assembledModel.config)) {
                    logger.info(`[Diff] Queuing insert for new model ${apiIdentifier}`);
                    modelsToInsert.push({
                        api_identifier: apiIdentifier,
                        name: assembledModel.name,
                        description: assembledModel.description ?? null,
                        provider: providerName,
                        config: assembledModel.config,
                    });
                } else {
                     logger.error(`[Diff] Assembled config for new model ${apiIdentifier} is not valid JSON. SKIPPING insert.`);
                }
            } else {
                // Assembled config for a new model is invalid. Do not insert.
                if (!assembledValidation.success) {
                    logger.error(`[Diff] Assembled config for new model ${apiIdentifier} is INVALID. SKIPPING insert.`, { error: assembledValidation.error.format() });
                }
            }
        }
    }

    // Any models remaining in dbModelMap were not in the assembled list.
    // They are obsolete and must be handled.
    for (const dbModel of dbModelMap.values()) {
        const dbValidation = AiModelExtendedConfigSchema.safeParse(dbModel.config);
        
        if (!dbValidation.success) {
            // This DB model is obsolete AND its config is invalid. Sanitize it.
            logger.warn(`[Diff] Obsolete DB model ${dbModel.api_identifier} has an invalid config. Sanitizing.`, { error: dbValidation.error.format() });
            
            const failsafeConfig: AiModelExtendedConfig = {
                api_identifier: dbModel.api_identifier,
                input_token_cost_rate: null,
                output_token_cost_rate: null,
                context_window_tokens: null,
                hard_cap_output_tokens: 1, // Must be a positive number
                tokenization_strategy: { type: 'rough_char_count', chars_per_token_ratio: 4 },
            };

            if (isJson(failsafeConfig)) {
                modelsToUpdate.push({
                    id: dbModel.id,
                    changes: { 
                        is_active: false,
                        config: failsafeConfig,
                        description: `[SANITIZED/OBSOLETE]: ${dbModel.description ?? 'No description.'}`
                    },
                });
            } else {
                logger.error(`[Diff] CRITICAL FAILURE: Failsafe config for obsolete model ${dbModel.api_identifier} is not valid JSON. Cannot sanitize.`);
            }
        } else {
            // This DB model is obsolete but its config is valid. Deactivate if active.
            if (dbModel.is_active) {
                logger.info(`[Diff] Queuing obsolete but valid model ${dbModel.api_identifier} for deactivation.`);
                modelsToDeactivate.push(dbModel.id);
            }
        }
    }
        
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
