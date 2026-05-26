// supabase/functions/sync-ai-models/diffAndPrepareDbOps.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import isEqual from 'npm:fast-deep-equal';
import type { ILogger, FinalAppModelConfig } from '../_shared/types.ts';
import { DbAiProvider } from './sync-ai-models.interface.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import { AiModelExtendedConfigSchema } from '../chat/zodSchema.ts';
import type { AiModelExtendedConfig } from '../_shared/types.ts';
import type { ModelCostProvenance } from './config_assembler.interface.ts';
import type { DbOpLists, DbOpResult, AiProvidersSyncInsert, AiProvidersSyncUpdate, ModelsToUpdate } from './sync-ai-models.interface.ts';

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
    costProvenance: Map<string, ModelCostProvenance>,
): DbOpLists {
    const modelsToInsert: AiProvidersSyncInsert[] = [];
    const modelsToUpdate: ModelsToUpdate[] = [];
    const modelsToDeactivate: string[] = [];
    
    const dbModelMap = new Map<string, DbAiProvider>(dbModels.map(m => [m.api_identifier, m]));
    const assembledConfigMap = new Map<string, FinalAppModelConfig>(assembledConfigs.map(m => [m.api_identifier, m]));

    logger.info(`--- [Diff] Starting diff for ${providerName} ---`);
    logger.info(`[Diff] ${assembledConfigMap.size} assembled models vs. ${dbModelMap.size} DB models.`);

    for (const [apiIdentifier, assembledModel] of assembledConfigMap.entries()) {
        const dbModel = dbModelMap.get(apiIdentifier);
        const provenance: ModelCostProvenance = costProvenance.get(apiIdentifier) ?? { input_source: 'none', output_source: 'none' };

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
                        hard_cap_output_tokens: 1,
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
                        logger.error(`[Diff] CRITICAL FAILURE: Failsafe config for ${dbModel.api_identifier} is not valid JSON. Cannot sanitize.`);
                    }

                    dbModelMap.delete(apiIdentifier);
                }
            } else if (!assembledValidation.success) {
                // The database config is VALID, but the assembled one is NOT.
                // Do nothing to the DB. Log and mark as handled so it won't be deactivated.
                logger.error(`[Diff] Assembled config for ${apiIdentifier} is INVALID, but DB config is valid. SKIPPING update to prevent corruption.`, { error: assembledValidation.error.format() });
                dbModelMap.delete(apiIdentifier);
            } else {
                // Both configs are VALID. Compare for standard changes.
                const changes: AiProvidersSyncUpdate = {};
                if (assembledModel.name !== dbModel.name) changes.name = assembledModel.name;
                if ((assembledModel.description ?? null) !== dbModel.description) changes.description = assembledModel.description ?? null;
                if (!dbModel.is_active) changes.is_active = true;
                if (!isEqual(assembledModel.config, dbModel.config)) {
                    if (isJson(assembledModel.config)) {
                        // When provenance is none for a cost field, preserve the existing DB value if non-null.
                        if (provenance.input_source === 'none' || provenance.output_source === 'none') {
                            const dbParsed = AiModelExtendedConfigSchema.safeParse(dbModel.config);
                            const mergedConfig: AiModelExtendedConfig = { ...assembledValidation.data };
                            if (provenance.input_source === 'none' && dbParsed.success && dbParsed.data.input_token_cost_rate !== null) {
                                mergedConfig.input_token_cost_rate = dbParsed.data.input_token_cost_rate;
                                logger.info(`[Diff] Suppressing cost overwrite for ${apiIdentifier}: preserving DB input_token_cost_rate=${String(dbParsed.data.input_token_cost_rate)} (assembled provenance=none)`);
                            }
                            if (provenance.output_source === 'none' && dbParsed.success && dbParsed.data.output_token_cost_rate !== null) {
                                mergedConfig.output_token_cost_rate = dbParsed.data.output_token_cost_rate;
                                logger.info(`[Diff] Suppressing cost overwrite for ${apiIdentifier}: preserving DB output_token_cost_rate=${String(dbParsed.data.output_token_cost_rate)} (assembled provenance=none)`);
                            }
                            if (!isEqual(mergedConfig, dbModel.config) && isJson(mergedConfig)) {
                                changes.config = mergedConfig;
                            }
                        } else {
                            changes.config = assembledModel.config;
                        }
                    }
                }
                let outputRate: AiModelExtendedConfig['output_token_cost_rate'] = dbValidation.data.output_token_cost_rate;
                if (changes.config !== undefined) {
                    const configForTier = AiModelExtendedConfigSchema.safeParse(changes.config);
                    if (configForTier.success) {
                        outputRate = configForTier.data.output_token_cost_rate;
                    }
                }
                let minPlanTierLevel: DbAiProvider['min_plan_tier_level'];
                if (outputRate === null) {
                    minPlanTierLevel = 99;
                } else if (outputRate < 10) {
                    minPlanTierLevel = 0;
                } else if (outputRate < 20) {
                    minPlanTierLevel = 10;
                } else {
                    minPlanTierLevel = 20;
                }
                if (minPlanTierLevel !== dbModel.min_plan_tier_level) {
                    changes.min_plan_tier_level = minPlanTierLevel;
                    logger.info(
                        `[Diff] Correcting min_plan_tier_level=${String(minPlanTierLevel)} for ${apiIdentifier} based on output_token_cost_rate=${String(outputRate)}`,
                    );
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
                    const outputRate: AiModelExtendedConfig['output_token_cost_rate'] = assembledModel.config.output_token_cost_rate;
                    let minPlanTierLevel: DbAiProvider['min_plan_tier_level'];
                    if (outputRate === null) {
                        minPlanTierLevel = 99;
                    } else if (outputRate < 10) {
                        minPlanTierLevel = 0;
                    } else if (outputRate < 20) {
                        minPlanTierLevel = 10;
                    } else {
                        minPlanTierLevel = 20;
                    }
                    logger.info(`[Diff] Auto-assigned min_plan_tier_level=${String(minPlanTierLevel)} for new model ${apiIdentifier} based on output_token_cost_rate=${String(outputRate)}`);
                    const isEnabled: boolean = provenance.input_source !== 'none' || provenance.output_source !== 'none';
                    if (!isEnabled) {
                        logger.error(`[Diff] ALARM: New model ${apiIdentifier} has no trusted cost data. Inserted as disabled.`);
                    }
                    logger.info(`[Diff] Queuing insert for new model ${apiIdentifier}`);
                    const insertRow: AiProvidersSyncInsert = {
                        api_identifier: apiIdentifier,
                        name: assembledModel.name,
                        description: assembledModel.description,
                        provider: providerName,
                        config: assembledModel.config,
                        is_enabled: isEnabled,
                        min_plan_tier_level: minPlanTierLevel,
                    };
                    modelsToInsert.push(insertRow);
                } else {
                     logger.error(`[Diff] Assembled config for new model ${apiIdentifier} is not valid JSON. SKIPPING insert.`);
                }
            } else {
                logger.error(`[Diff] CRITICAL: Config for new model ${apiIdentifier} is not valid JSON. Cannot insert.`);
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
