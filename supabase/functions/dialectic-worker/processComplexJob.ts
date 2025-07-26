// supabase/functions/dialectic-worker/processComplexJob.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../types_db.ts';
import type {
    DialecticJobPayload,
    DialecticJobRow,
} from '../dialectic-service/dialectic.interface.ts';
import { planComplexStage } from './task_isolator.ts';
import type { ILogger } from '../_shared/types.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';

export interface IPlanComplexJobDeps {
    logger: ILogger;
    planComplexStage: typeof planComplexStage;
    promptAssembler: PromptAssembler;
    downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>;
}

export async function processComplexJob(
    dbClient: SupabaseClient<Database>,
    job: DialecticJobRow & { payload: DialecticJobPayload },
    projectOwnerUserId: string,
    deps: IPlanComplexJobDeps,
): Promise<void> {
    const { id: parentJobId } = job;
    deps.logger.info(`[processComplexJob] Planning complex job ${parentJobId}`);

    try {
        // 1. Call the planner to get the child jobs.
        const childJobs = await deps.planComplexStage(
            dbClient,
            job,
            projectOwnerUserId,
            deps.logger,
            deps.downloadFromStorage,
            deps.promptAssembler
        );

        if (!childJobs || childJobs.length === 0) {
            deps.logger.warn(`[processComplexJob] Planner returned no child jobs for parent ${parentJobId}. Completing parent job.`);
            await dbClient.from('dialectic_generation_jobs').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                results: { status_reason: 'Planner generated no child jobs to execute.' }
            }).eq('id', parentJobId);
            return;
        }

        deps.logger.info(`[processComplexJob] Planner created ${childJobs.length} child jobs for parent ${parentJobId}. Enqueuing now.`);

        // 2. Enqueue the child jobs.
        const { error: insertError } = await dbClient.from('dialectic_generation_jobs').insert(childJobs);
        if (insertError) {
            throw new Error(`Failed to insert child jobs: ${insertError.message}`);
        }

        // 3. Update the parent job's status to signal it's waiting for the children.
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