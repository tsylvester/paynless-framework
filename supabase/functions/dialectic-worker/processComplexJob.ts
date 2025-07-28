// supabase/functions/dialectic-worker/processComplexJob.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import type {
    DialecticJobRow,
    DialecticPlanJobPayload,
    DialecticRecipeStep,
    GranularityPlannerFn,
} from '../dialectic-service/dialectic.interface.ts';
import { planComplexStage } from './task_isolator.ts';
import type { ILogger } from '../_shared/types.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { isDialecticPlanJobPayload, isDialecticStageRecipe, isJson } from '../_shared/utils/type_guards.ts';

export interface IPlanComplexJobDeps {
    logger: ILogger;
    planComplexStage: (
        dbClient: SupabaseClient<Database>,
        parentJob: DialecticJobRow & { payload: DialecticPlanJobPayload },
        deps: IPlanComplexJobDeps,
        recipeStep: DialecticRecipeStep
    ) => Promise<(DialecticJobRow)[]>;
    promptAssembler: PromptAssembler;
    downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>;
    getGranularityPlanner: (strategyId: string) => GranularityPlannerFn | undefined;
}

export async function processComplexJob(
    dbClient: SupabaseClient<Database>,
    job: DialecticJobRow & { payload: DialecticPlanJobPayload },
    projectOwnerUserId: string,
    deps: IPlanComplexJobDeps,
): Promise<void> {
    const { id: parentJobId } = job;
    
    if (!isDialecticPlanJobPayload(job.payload)) {
        throw new Error(`[processComplexJob] Job ${parentJobId} has an invalid payload for complex processing.`);
    }
    
    deps.logger.info(`[processComplexJob] Processing step ${job.payload.step_info.current_step}/${job.payload.step_info.total_steps} for job ${parentJobId}`);

    // 1. Fetch the recipe and validate its structure with a type guard
    const { data: stageData, error: stageError } = await dbClient.from('dialectic_stages').select('input_artifact_rules').eq('slug', job.payload.stageSlug!).single();
    if (stageError || !stageData) throw new Error(`Stage '${job.payload.stageSlug}' not found.`);

    if (!isDialecticStageRecipe(stageData.input_artifact_rules)) {
        throw new Error(`Stage '${job.payload.stageSlug}' has an invalid or missing recipe.`);
    }
    const recipe = stageData.input_artifact_rules;

    // 2. Handle "waking up" after children complete
    if (job.status === 'pending_next_step') {
        job.payload.step_info.current_step++;
        
        if (isJson(job.payload)) {
            const { error: payloadUpdateError } = await dbClient
                .from('dialectic_generation_jobs')
                .update({ payload: job.payload })
                .eq('id', parentJobId);

            if (payloadUpdateError) {
                throw new Error(`Failed to increment step for job ${parentJobId}: ${payloadUpdateError.message}`);
            }
        } else {
            // This should be impossible if DialecticPlanJobPayload only contains JSON-safe types.
            throw new Error(`CRITICAL: The constructed payload for job ${parentJobId} is not valid JSON.`);
        }
    }
    
    // 3. If we've completed all steps, we're done.
    if (job.payload.step_info.current_step > job.payload.step_info.total_steps) {
        deps.logger.info(`[processComplexJob] All ${job.payload.step_info.total_steps} steps complete for parent job ${parentJobId}.`);
        await dbClient.from('dialectic_generation_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', parentJobId);
        return;
    }

    // 4. Determine the current step's recipe
    const currentRecipeStep = recipe.steps.find(s => s.step === job.payload.step_info.current_step);
    if (!currentRecipeStep) {
        throw new Error(`Could not find recipe for step ${job.payload.step_info.current_step} in stage '${job.payload.stageSlug}'.`);
    }

    try {
        // 5. Delegate to the planner to get the child jobs.
        const childJobs = await deps.planComplexStage(
            dbClient,
            job,
            deps,
            currentRecipeStep
        );

        if (!childJobs || childJobs.length === 0) {
            deps.logger.warn(`[processComplexJob] Planner returned no child jobs for parent ${parentJobId}. Completing parent job.`);
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                results: { status_reason: 'Planner generated no child jobs for the current step.' },
            }).eq('id', parentJobId);
            return;
        }

        deps.logger.info(`[processComplexJob] Planner created ${childJobs.length} child jobs for parent ${parentJobId}. Enqueuing now.`);

        // 6. Enqueue the child jobs.
        const { error: insertError } = await dbClient.from('dialectic_generation_jobs').insert(childJobs);
        if (insertError) {
            throw new Error(`Failed to insert child jobs: ${insertError.message}`);
        }

        // 7. Update the parent job's status to signal it's waiting for the children.
        const { error: updateError } = await dbClient.from('dialectic_generation_jobs').update({
            status: 'waiting_for_children',
        }).eq('id', parentJobId);

        if (updateError) {
            throw new Error(`Failed to update parent job status: ${updateError.message}`);
        }

        deps.logger.info(`[processComplexJob] Successfully enqueued child jobs and updated parent job ${parentJobId} to 'waiting_for_children'.`);

    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        deps.logger.error(`[processComplexJob] Error processing complex job ${parentJobId}`, { error });
        
        const failureReason = e instanceof ContextWindowError 
            ? `Context window limit exceeded: ${error.message}`
            : `Failed to plan or enqueue child jobs: ${error.message}`;

        // If planning or enqueuing fails, mark the parent job as failed.
        await dbClient.from('dialectic_generation_jobs').update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_details: { message: failureReason }
        }).eq('id', parentJobId);
    }
}