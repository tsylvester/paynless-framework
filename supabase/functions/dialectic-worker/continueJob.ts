import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../types_db.ts';
import {
  type DialecticJobPayload,
  type UnifiedAIResponse,
  type DialecticContributionRow,
  type IContinueJobDeps,
  type IContinueJobResult,
} from '../dialectic-service/dialectic.interface.ts';
import { shouldContinue } from '../_shared/utils/continue_util.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];
type JobInsert = Database['public']['Tables']['dialectic_generation_jobs']['Insert'];

export async function continueJob(
  deps: IContinueJobDeps,
  dbClient: SupabaseClient<Database>,
  job: Job & { payload: DialecticJobPayload },
  aiResponse: UnifiedAIResponse,
  savedContribution: DialecticContributionRow,
  projectOwnerUserId: string
): Promise<IContinueJobResult> {
  
  const willContinue = shouldContinue(aiResponse.finish_reason ?? null, job.payload.continuation_count ?? 0, 5) && job.payload.continueUntilComplete;
  
  if (!willContinue) {
    return { enqueued: false };
  }

  deps.logger.info(`[dialectic-worker] [continueJob] Continuation required for job ${job.id}. Enqueuing new job.`);

  const newPayload: DialecticJobPayload = {
    // These properties are essential for the job processing logic itself
    sessionId: job.payload.sessionId, 
    projectId: job.payload.projectId,
    model_id: job.payload.model_id,
    stageSlug: job.payload.stageSlug,
    iterationNumber: job.payload.iterationNumber,
    // Core continuation fields
    continueUntilComplete: job.payload.continueUntilComplete,
    target_contribution_id: savedContribution.id,
    continuation_count: (job.payload.continuation_count ?? 0) + 1,
    // Optional fields that need to be passed through
    chatId: job.payload.chatId,
    walletId: job.payload.walletId,
    maxRetries: job.payload.maxRetries,
  };

  // Ensure that optional fields are not included in the payload if they are undefined.
  if (newPayload.chatId === undefined) delete newPayload.chatId;
  if (newPayload.walletId === undefined) delete newPayload.walletId;
  if (newPayload.maxRetries === undefined) delete newPayload.maxRetries;

  const newJobToInsert: JobInsert = {
    session_id: job.session_id,
    user_id: projectOwnerUserId,
    stage_slug: job.stage_slug,
    iteration_number: job.iteration_number,
    payload: newPayload,
    status: 'pending_continuation',
    attempt_count: 0,
    max_retries: job.max_retries,
    parent_job_id: job.parent_job_id,
  };

  // The type of `newJobToInsert` is compatible with the `insert` method's expected type.
  const { error: insertError } = await dbClient.from('dialectic_generation_jobs').insert(newJobToInsert);
  
  if (insertError) {
    deps.logger.error(`[dialectic-worker] [continueJob] Failed to enqueue continuation job.`, { error: insertError });
    return {
        enqueued: false,
        error: new Error(`Failed to enqueue continuation job: ${insertError.message}`)
    };
  }

  deps.logger.info(`[dialectic-worker] [continueJob] Successfully enqueued continuation job for contribution ${savedContribution.id}.`);
  
  return { enqueued: true };
}
