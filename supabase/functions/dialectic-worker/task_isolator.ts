// supabase/functions/dialectic-worker/task_isolator.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    SourceDocument,
} from '../dialectic-service/dialectic.interface.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { ILogger } from '../_shared/types.ts';
import { IPlanComplexJobDeps } from './processComplexJob.ts';
import { isDialecticCombinationJobPayload, isDialecticExecuteJobPayload } from '../_shared/utils/type_guards.ts';

async function findSourceDocuments(
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    inputsRequired: DialecticRecipeStep['inputs_required'],
    downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>,
    logger: ILogger,
): Promise<SourceDocument[]> {
    logger.info(`[task_isolator] [findSourceDocuments] Finding documents for job ${parentJob.id} based on recipe...`, { inputsRequired });

    const allSourceDocuments: SourceDocument[] = [];

    for (const rule of inputsRequired) {
        let query = dbClient
            .from('dialectic_contributions')
            .select('*')
            .eq('session_id', parentJob.session_id)
            .eq('iteration_number', parentJob.iteration_number)
            .eq('is_latest_edit', true)
            .eq('contribution_type', rule.type);

        if (rule.stage_slug) {
            query = query.eq('stage', rule.stage_slug);
        }

        const { data: sourceContributions, error: contribError } = await query;

        if (contribError) {
            throw new Error(`Failed to fetch source contributions for type '${rule.type}': ${contribError.message}`);
        }

        if (!sourceContributions || sourceContributions.length === 0) {
            logger.warn(`[task_isolator] [findSourceDocuments] No contributions found for type '${rule.type}'.`);
            continue;
        }

        logger.info(`[task_isolator] [findSourceDocuments] Found ${sourceContributions.length} contributions for type '${rule.type}'.`);

        const documents = await Promise.all(
            sourceContributions.map(async (contrib) => {
                if (!contrib.file_name || !contrib.storage_bucket || !contrib.storage_path) {
                    logger.warn(`Contribution ${contrib.id} is missing required storage information (file_name, storage_bucket, or storage_path) and will be skipped.`);
                    return null;
                }
                const fullPath = `${contrib.storage_path}/${contrib.file_name}`;
                const { data, error } = await downloadFromStorage(contrib.storage_bucket, fullPath);
                if (error) {
                    throw new Error(`Failed to download content for contribution ${contrib.id} from ${fullPath}: ${error.message}`);
                }
                return {
                    ...contrib,
                    content: new TextDecoder().decode(data!),
                };
            })
        );
        
        const validDocuments = documents.filter((doc): doc is NonNullable<typeof doc> => doc !== null);
        allSourceDocuments.push(...validDocuments);
    }
    
    logger.info(`[task_isolator] [findSourceDocuments] Total valid source documents found: ${allSourceDocuments.length}`);
    return allSourceDocuments;
}

export async function planComplexStage(
    dbClient: SupabaseClient<Database>,
    parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
    deps: IPlanComplexJobDeps,
    recipeStep: DialecticRecipeStep,
): Promise<DialecticJobRow[]> {
    deps.logger.info(`[task_isolator] [planComplexStage] Planning step "${recipeStep.name}" for parent job ID: ${parentJob.id}`);
    
    // 1. Fetch source documents required for this specific step.
    const sourceDocuments = await findSourceDocuments(
        dbClient, 
        parentJob, 
        recipeStep.inputs_required,
        deps.downloadFromStorage,
        deps.logger
    );
    
    if (sourceDocuments.length === 0) {
        deps.logger.info(`[task_isolator] [planComplexStage] No source documents found for step "${recipeStep.name}". Skipping planning.`);
        return [];
    }

    // TODO: Tier 2 Context Check
    
    // 2. Get the correct planner function.
    const planner = deps.getGranularityPlanner(recipeStep.granularity_strategy);
    if (!planner) {
        throw new Error(`No planner found for granularity strategy: ${recipeStep.granularity_strategy}`);
    }

    // 3. Execute the planner to get the child job payloads.
    const childJobPayloads = planner(sourceDocuments, parentJob, recipeStep);

    // 4. Map to full job rows for DB insertion, handling each payload type safely.
    const childJobsToInsert: DialecticJobRow[] = [];

    for (const payload of childJobPayloads) {
        let jobRow: DialecticJobRow | null = null;
        const baseJobProps = {
            id: crypto.randomUUID(),
            parent_job_id: parentJob.id,
            session_id: parentJob.session_id,
            user_id: parentJob.user_id,
            stage_slug: parentJob.stage_slug,
            iteration_number: parentJob.iteration_number,
            status: 'pending',
            max_retries: parentJob.max_retries,
            attempt_count: 0,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            target_contribution_id: null,
            prerequisite_job_id: null,
        };

        if (isDialecticExecuteJobPayload(payload)) {
            jobRow = {
                ...baseJobProps,
                payload: {
                    job_type: payload.job_type,
                    step_info: {
                        current_step: payload.step_info.current_step,
                        total_steps: payload.step_info.total_steps,
                    },
                    prompt_template_name: payload.prompt_template_name,
                    output_type: payload.output_type,
                    inputs: payload.inputs,
                    model_id: payload.model_id,
                    projectId: payload.projectId,
                    sessionId: payload.sessionId,
                    stageSlug: payload.stageSlug,
                    iterationNumber: payload.iterationNumber,
                    walletId: payload.walletId,
                    continueUntilComplete: payload.continueUntilComplete,
                    maxRetries: payload.maxRetries,
                    continuation_count: payload.continuation_count,
                    ...(payload.document_relationships && { document_relationships: payload.document_relationships }),
                    ...(payload.target_contribution_id && { target_contribution_id: payload.target_contribution_id }),
                },
            };
        } else if (isDialecticCombinationJobPayload(payload)) {
            const inputs: { document_ids?: string[], source_group_id?: string } = {};
            if (payload.inputs?.document_ids) {
                inputs.document_ids = payload.inputs.document_ids;
            }
            if (payload.inputs?.source_group_id && typeof payload.inputs.source_group_id === 'string') {
                inputs.source_group_id = payload.inputs.source_group_id;
            }
            
            jobRow = {
                ...baseJobProps,
                payload: {
                    job_type: payload.job_type,
                    inputs: inputs,
                    model_id: payload.model_id,
                    projectId: payload.projectId,
                    sessionId: payload.sessionId,
                    stageSlug: payload.stageSlug,
                    iterationNumber: payload.iterationNumber,
                    walletId: payload.walletId,
                    continueUntilComplete: payload.continueUntilComplete,
                    maxRetries: payload.maxRetries,
                    continuation_count: payload.continuation_count,
                    ...(payload.step_info && { step_info: payload.step_info }),
                    ...(payload.prompt_template_name && { prompt_template_name: payload.prompt_template_name }),
                    ...(payload.target_contribution_id && { target_contribution_id: payload.target_contribution_id }),
                },
            };
        }
        
        if (jobRow) {
            childJobsToInsert.push(jobRow);
        }
    }

    deps.logger.info(`[task_isolator] [planComplexStage] Planned ${childJobsToInsert.length} child jobs for step "${recipeStep.name}".`);
    return childJobsToInsert;
}
