import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../types_db.ts';
import {
  type UnifiedAIResponse,
  type DialecticContributionRow,
  type IContinueJobDeps,
  type IContinueJobResult,
  type DialecticExecuteJobPayload,
} from '../dialectic-service/dialectic.interface.ts';
import { shouldContinue } from '../_shared/utils/continue_util.ts';
import {
  isContinuablePayload,
  isDialecticJobPayload,
  isDialecticPlanJobPayload,
  isJson,
  isDialecticStepInfo,
  isStringRecord,
  isContributionType,
} from '../_shared/utils/type_guards.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];
type JobInsert = Database['public']['Tables']['dialectic_generation_jobs']['Insert'];

export async function continueJob(
  deps: IContinueJobDeps,
  dbClient: SupabaseClient<Database>,
  job: Job,
  aiResponse: UnifiedAIResponse,
  savedContribution: DialecticContributionRow,
  projectOwnerUserId: string
): Promise<IContinueJobResult> {
  if (!isContinuablePayload(job.payload)) {
    const error = new Error('Invalid or non-continuable job payload');
    deps.logger.error('Cannot continue job due to invalid payload.', { jobId: job.id, payload: job.payload, error: error.message });
    return { enqueued: false, error };
  }

  // A continuation job MUST have a valid output_type to continue.
  if (!('output_type' in job.payload) || typeof job.payload.output_type !== 'string' || !isContributionType(job.payload.output_type)) {
    const error = new Error(`Job ${job.id} cannot be continued because its payload is missing a valid 'output_type'.`);
    deps.logger.error(error.message, { jobId: job.id, payload: job.payload });
    return { enqueued: false, error };
  }

  const willContinue = shouldContinue(aiResponse.finish_reason ?? null, job.payload.continuation_count ?? 0, 5) && job.payload.continueUntilComplete;
  
  if (!willContinue) {
    return { enqueued: false };
  }

  deps.logger.info(`[dialectic-worker] [continueJob] Continuation required for job ${job.id}. Enqueuing new job.`);

  const newContinuationCount = (job.payload.continuation_count ?? 0) + 1;

  const payloadObject: DialecticExecuteJobPayload = {
    job_type: 'execute',
    sessionId: job.payload.sessionId,
    projectId: job.payload.projectId,
    model_id: job.payload.model_id,
    stageSlug: job.payload.stageSlug,
    iterationNumber: job.payload.iterationNumber,
    continueUntilComplete: job.payload.continueUntilComplete,
    target_contribution_id: savedContribution.id,
    continuation_count: newContinuationCount,
    walletId: job.payload.walletId,
    maxRetries: job.payload.maxRetries,
    // Carry over execution-specific details from the original payload
    step_info: 'step_info' in job.payload && isDialecticStepInfo(job.payload.step_info)
        ? job.payload.step_info 
        : { current_step: newContinuationCount, total_steps: -1 }, // Fallback, -1 indicates unknown total
    prompt_template_name: 'prompt_template_name' in job.payload && typeof job.payload.prompt_template_name === 'string' 
        ? job.payload.prompt_template_name 
        : 'default_continuation_prompt',
    output_type: job.payload.output_type, // We have already validated this is a valid ContributionType.
    inputs: 'inputs' in job.payload && isStringRecord(job.payload.inputs)
        ? job.payload.inputs
        : {},
  };
  
  // Remove undefined keys to keep the payload clean. JSON.stringify would do this anyway,
  // but this makes the new payload object explicit and easier to debug.
  const newPayload: { [key: string]: Json | undefined } = {};
  for (const [key, value] of Object.entries(payloadObject)) {
    if (value !== undefined) {
      newPayload[key] = value;
    }
  }

  if (!isJson(newPayload)) {
    // This should be theoretically impossible since we construct it from Json-compatible parts.
    // This check satisfies the compiler's strictness.
    const error = new Error('Constructed payload is not valid JSON.');
    deps.logger.error('Failed to create valid JSON payload for continuation.', { jobId: job.id, newPayload });
    return { enqueued: false, error };
  }

  if (!isDialecticJobPayload(newPayload) && !isDialecticPlanJobPayload(newPayload)) {
    deps.logger.error('[dialectic-worker] [continueJob] Failed to construct a valid continuation payload.', { payload: newPayload });
    return { enqueued: false, error: new Error('Failed to construct a valid continuation payload.') };
  }

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
