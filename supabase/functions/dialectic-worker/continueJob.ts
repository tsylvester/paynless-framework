import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../types_db.ts';
import {
  type UnifiedAIResponse,
  type DialecticContributionRow,
  type IContinueJobDeps,
  type IContinueJobResult,
} from '../dialectic-service/dialectic.interface.ts';
import { shouldContinue } from '../_shared/utils/continue_util.ts';
import {
  isContinuablePayload,
  isDialecticExecuteJobPayload,
  isJson,
  isDialecticStepInfo,
  isStringRecord,
  isContributionType,
  isRecord,
  isDocumentRelationships,
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

  // Enforce presence of user_jwt in the triggering payload (no healing/injection allowed)
  let userJwt: string | undefined = undefined;
  if (isRecord(job.payload)) {
    const desc = Object.getOwnPropertyDescriptor(job.payload, 'user_jwt');
    const potential = desc ? desc.value : undefined;
    if (typeof potential === 'string' && potential.length > 0) {
      userJwt = potential;
    }
  }
  if (!userJwt) {
    const error = new Error('payload.user_jwt required');
    deps.logger.error('[dialectic-worker] [continueJob] Missing or empty user_jwt on triggering payload.', { jobId: job.id });
    return { enqueued: false, error };
  }

  const willContinue = shouldContinue(aiResponse.finish_reason ?? null, job.payload.continuation_count ?? 0, 5) && job.payload.continueUntilComplete;
  
  if (!willContinue) {
    return { enqueued: false };
  }

  deps.logger.info(`[dialectic-worker] [continueJob] Continuation required for job ${job.id}. Enqueuing new job.`);

  const newContinuationCount = (job.payload.continuation_count ?? 0) + 1;

  if (!job.payload.walletId) {
    const error = new Error('Job payload is missing a valid walletId');
    deps.logger.error('Cannot continue job due to invalid walletId.', { jobId: job.id, payload: job.payload, error: error.message });
    return { enqueued: false, error };
  }

  // Start from the original payload (full pass-through), then overlay only required fields
  const basePayload: { [key: string]: Json } = {};
  if (isRecord(job.payload)) {
    for (const [key, value] of Object.entries(job.payload)) {
      if (isJson(value)) {
        basePayload[key] = value;
      }
    }
  }

  // Explicitly preserve user_jwt from the triggering payload
  basePayload.user_jwt = userJwt;

  // Ensure required structural fields exist and are correct
  basePayload.job_type = 'execute';
  basePayload.target_contribution_id = savedContribution.id;
  basePayload.continuation_count = newContinuationCount;
  basePayload.output_type = job.payload.output_type;

  // Ensure inputs exists and is a record of strings
  if (!('inputs' in basePayload) || !isStringRecord((basePayload).inputs)) {
    basePayload.inputs = {};
  }

  // Canonical path params: preserve existing, enforce contributionType = output_type
  const existingCanon = 'canonicalPathParams' in job.payload && isRecord(job.payload.canonicalPathParams)
    ? job.payload.canonicalPathParams
    : undefined;
  const canonical: Record<string, Json> = {};
  if (existingCanon && isRecord(existingCanon)) {
    for (const [k, v] of Object.entries(existingCanon)) {
      if (isJson(v)) {
        canonical[k] = v;
      }
    }
  }
  canonical.contributionType = job.payload.output_type;
  basePayload.canonicalPathParams = canonical;

  // Document relationships: keep original if valid; otherwise use saved contribution relationships
  if (
    !('document_relationships' in job.payload && isDocumentRelationships(job.payload.document_relationships)) &&
    isDocumentRelationships(savedContribution.document_relationships)
  ) {
    basePayload.document_relationships = savedContribution.document_relationships;
  }

  // Preserve step_info only if valid (do not invent structure here)
  if ('step_info' in job.payload && !isDialecticStepInfo((job.payload).step_info)) {
    delete basePayload.step_info;
  }

  // Validate payloadObject shape after overlays
  const payloadObject = basePayload;

  // Invariant: Continuation enqueue requires valid document_relationships from either the triggering payload
  // or the saved contribution. Do not enqueue if missing.
  if (!isDocumentRelationships(payloadObject.document_relationships)) {
    const error = new Error('Continuation enqueue requires valid document_relationships');
    deps.logger.error('[dialectic-worker] [continueJob] Missing document_relationships for continuation.', {
      jobId: job.id,
      payloadHasRelationships: 'document_relationships' in job.payload && isDocumentRelationships(job.payload.document_relationships),
      savedHasRelationships: isDocumentRelationships(savedContribution.document_relationships),
    });
    return { enqueued: false, error };
  }
  
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

  if (!isDialecticExecuteJobPayload(newPayload)) {
    deps.logger.error('[dialectic-worker] [continueJob] Failed to construct a valid continuation payload.', { payload: newPayload });
    return { enqueued: false, error: new Error('Failed to construct a valid continuation payload.') };
  }

  const newJobToInsert: JobInsert = {
    // Provide an id so tests can validate a full row shape via type guard
    id: (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
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
