import type { Database } from '../../types_db.ts';
import type { DialecticExecuteJobPayload } from '../../dialectic-service/dialectic.interface.ts';
import {
  isContinuablePayload,
  isDialecticExecuteJobPayload,
  isJson,
  isDocumentRelationships,
} from '../../_shared/utils/type_guards.ts';
import {
  isDialecticStageSlug,
  isModelContributionFileType,
} from '../../_shared/utils/type-guards/type_guards.file_manager.ts';
import type { CanonicalPathParams } from '../../_shared/types/file_manager.types.ts';
import type { ContinueJobFn } from '../createJobContext/JobContext.interface.ts';
import {
  isDialecticCompressJobPayload,
  type DialecticCompressJobPayload,
} from '../enqueueCompressJobs/enqueueCompressJobs.provides.ts';

type JobInsert = Database['public']['Tables']['dialectic_generation_jobs']['Insert'];

export const continueJob: ContinueJobFn = async (
  deps,
  dbClient,
  job,
  aiResponse,
  savedOutput,
  projectOwnerUserId,
) => {
  if (!isContinuablePayload(job.payload)) {
    const error = new Error('Invalid or non-continuable job payload');
    deps.logger.error('Cannot continue job due to invalid payload.', { jobId: job.id, payload: job.payload, error: error.message });
    return { enqueued: false, error };
  }

  const currentContinuationCount: number = job.payload.continuation_count ?? 0;
  const newContinuationCount: number = currentContinuationCount + 1;

  // Both arms feed the shared tail: the payload they built, the row's job type, its
  // target contribution and its test flag.
  let continuationPayload: JobInsert['payload'];
  let continuationJobType: JobInsert['job_type'];
  let continuationTargetContributionId: JobInsert['target_contribution_id'];
  let continuationIsTestJob: boolean;

  if (isDialecticCompressJobPayload(job.payload)) {
    const compressPayload: DialecticCompressJobPayload = {
      job_type: 'COMPRESS',
      sessionId: job.payload.sessionId,
      projectId: job.payload.projectId,
      stageSlug: job.payload.stageSlug,
      targetKey: job.payload.targetKey,
      iterationNumber: job.payload.iterationNumber,
      model_id: job.payload.model_id,
      model_slug: job.payload.model_slug,
      mode: job.payload.mode,
      content: job.payload.content,
      sourceType: job.payload.sourceType,
      walletId: job.payload.walletId,
      user_id: job.payload.user_id,
      continuation_count: newContinuationCount,
    };

    if (job.payload.sourceId !== undefined) {
      compressPayload.sourceId = job.payload.sourceId;
    }
    if (job.payload.role !== undefined) {
      compressPayload.role = job.payload.role;
    }
    if (job.payload.documentKey !== undefined) {
      compressPayload.documentKey = job.payload.documentKey;
    }
    if (job.payload.docType !== undefined) {
      compressPayload.docType = job.payload.docType;
    }
    if (job.payload.sourceStageSlug !== undefined) {
      compressPayload.sourceStageSlug = job.payload.sourceStageSlug;
    }
    if (job.payload.chunk_index !== undefined) {
      compressPayload.chunk_index = job.payload.chunk_index;
    }
    if (job.payload.chunk_total !== undefined) {
      compressPayload.chunk_total = job.payload.chunk_total;
    }

    if (!isJson(compressPayload)) {
      const error = new Error('Constructed payload is not valid JSON.');
      deps.logger.error('Failed to create valid JSON payload for continuation.', { jobId: job.id, newPayload: compressPayload });
      return { enqueued: false, error };
    }

    continuationPayload = compressPayload;
    continuationJobType = 'COMPRESS';
    continuationTargetContributionId = null;
    continuationIsTestJob = job.is_test_job === true;
  } else {
    // A continuation job MUST have a valid model-generated output_type to continue.
    if (!('output_type' in job.payload) || typeof job.payload.output_type !== 'string' || !isModelContributionFileType(job.payload.output_type)) {
      const error = new Error(`Job ${job.id} cannot be continued because its payload is missing a valid model-generated 'output_type'.`);
      deps.logger.error(error.message, { jobId: job.id, payload: job.payload });
      return { enqueued: false, error };
    }

    // Enforce presence of user_jwt in the triggering payload (no healing/injection allowed)
    if (!('user_jwt' in job.payload) || typeof job.payload.user_jwt !== 'string' || job.payload.user_jwt.length === 0) {
      const error = new Error('payload.user_jwt required');
      deps.logger.error('[dialectic-worker] [continueJob] Missing or empty user_jwt on triggering payload.', { jobId: job.id });
      return { enqueued: false, error };
    }

    if (!job.payload.walletId) {
      const error = new Error('Job payload is missing a valid walletId');
      deps.logger.error('Cannot continue job due to invalid walletId.', { jobId: job.id, payload: job.payload, error: error.message });
      return { enqueued: false, error };
    }

    // Document relationships: start from the trigger's. When the trigger has valid
    // relationships but lacks document_relationships[stageSlug], merge stageSlug from the
    // saved output (root-init sets it on the saved row).
    const triggerRels: unknown = 'document_relationships' in job.payload ? job.payload.document_relationships : undefined;
    const savedRels: unknown = 'document_relationships' in savedOutput ? savedOutput.document_relationships : undefined;

    let resolvedRelationships: unknown = triggerRels;
    if (!isDocumentRelationships(triggerRels) && isDocumentRelationships(savedRels)) {
      // No valid trigger relationships — use the saved output's entirely
      resolvedRelationships = savedRels;
    } else if (isDocumentRelationships(triggerRels) && isDocumentRelationships(savedRels)) {
      // Both have valid relationships — check if stageSlug needs merging from saved
      const slug: string = job.stage_slug;
      if (slug) {
        const triggerEntry = Object.entries(triggerRels).find(([key]) => key === slug);
        const savedEntry = Object.entries(savedRels).find(([key]) => key === slug);
        if ((!triggerEntry || typeof triggerEntry[1] !== 'string' || !triggerEntry[1].trim()) &&
            savedEntry && typeof savedEntry[1] === 'string' && savedEntry[1].trim()) {
          // Trigger lacks the stageSlug key but saved has it — merge it in
          resolvedRelationships = { ...triggerRels, [slug]: savedEntry[1] };
        }
      }
    }

    // Invariant: Continuation enqueue requires valid document_relationships from either the triggering payload
    // or the saved output. Do not enqueue if missing.
    if (!isDocumentRelationships(resolvedRelationships)) {
      const error = new Error('Continuation enqueue requires valid document_relationships');
      deps.logger.error('[dialectic-worker] [continueJob] Missing document_relationships for continuation.', {
        jobId: job.id,
        payloadHasRelationships: isDocumentRelationships(triggerRels),
        savedHasRelationships: isDocumentRelationships(savedRels),
      });
      return { enqueued: false, error };
    }

    // Last gate of the arm: narrow the parent payload the continuation literal is built from.
    // The guard throws a named Error per failed member; surface it unchanged.
    try {
      if (!isDialecticExecuteJobPayload(job.payload)) {
        const error = new Error(`Job ${job.id} cannot be continued because its payload is not a valid execute job payload.`);
        deps.logger.error(error.message, { jobId: job.id });
        return { enqueued: false, error };
      }
    } catch (thrown) {
      if (!(thrown instanceof Error)) {
        throw thrown;
      }
      deps.logger.error('[dialectic-worker] [continueJob] Execute continuation payload failed validation.', { jobId: job.id, error: thrown.message });
      return { enqueued: false, error: thrown };
    }

    if (!isDialecticStageSlug(job.payload.stageSlug)) {
      const error = new Error(`Job ${job.id} cannot be continued because its payload stageSlug is not a dialectic stage slug.`);
      deps.logger.error(error.message, { jobId: job.id, stageSlug: job.payload.stageSlug });
      return { enqueued: false, error };
    }

    // Canonical path params: preserve the parent's, set contributionType to stageSlug (tests expect stageSlug here)
    const continuationCanonicalPathParams: CanonicalPathParams = {
      ...job.payload.canonicalPathParams,
      contributionType: job.payload.stageSlug,
    };

    const executePayload: DialecticExecuteJobPayload = {
      sessionId: job.payload.sessionId,
      projectId: job.payload.projectId,
      model_id: job.payload.model_id,
      stageSlug: job.payload.stageSlug,
      iterationNumber: job.payload.iterationNumber,
      walletId: job.payload.walletId,
      user_jwt: job.payload.user_jwt,
      idempotencyKey: job.payload.idempotencyKey,
      prompt_template_id: job.payload.prompt_template_id,
      output_type: job.payload.output_type,
      inputs: job.payload.inputs,
      canonicalPathParams: continuationCanonicalPathParams,
      document_relationships: resolvedRelationships,
      target_contribution_id: savedOutput.id,
      continuation_count: newContinuationCount,
    };

    if (job.payload.continueUntilComplete !== undefined) {
      executePayload.continueUntilComplete = job.payload.continueUntilComplete;
    }
    if (job.payload.maxRetries !== undefined) {
      executePayload.maxRetries = job.payload.maxRetries;
    }
    if (job.payload.maxOutputTokens !== undefined) {
      executePayload.maxOutputTokens = job.payload.maxOutputTokens;
    }
    if (job.payload.model_slug !== undefined) {
      executePayload.model_slug = job.payload.model_slug;
    }
    if (job.payload.sourceContributionId !== undefined) {
      executePayload.sourceContributionId = job.payload.sourceContributionId;
    }
    if (job.payload.prompt_template_name !== undefined) {
      executePayload.prompt_template_name = job.payload.prompt_template_name;
    }
    if (job.payload.document_key !== undefined) {
      executePayload.document_key = job.payload.document_key;
    }
    if (job.payload.branch_key !== undefined) {
      executePayload.branch_key = job.payload.branch_key;
    }
    if (job.payload.parallel_group !== undefined) {
      executePayload.parallel_group = job.payload.parallel_group;
    }
    if (job.payload.planner_metadata !== undefined) {
      executePayload.planner_metadata = job.payload.planner_metadata;
    }
    if (job.payload.isIntermediate !== undefined) {
      executePayload.isIntermediate = job.payload.isIntermediate;
    }
    if (job.payload.context_for_documents !== undefined) {
      executePayload.context_for_documents = job.payload.context_for_documents;
    }

    // Parent test flag: row-level preferred, payload-level fallback for legacy callers.
    // Propagate into the payload only when the parent is a test job.
    const parentIsTestJob: boolean = job.is_test_job === true || job.payload.is_test_job === true;
    if (parentIsTestJob) {
      executePayload.is_test_job = true;
    }

    if (!isJson(executePayload)) {
      const error = new Error('Constructed payload is not valid JSON.');
      deps.logger.error('Failed to create valid JSON payload for continuation.', { jobId: job.id, newPayload: executePayload });
      return { enqueued: false, error };
    }

    continuationPayload = executePayload;
    continuationJobType = 'EXECUTE';
    continuationTargetContributionId = savedOutput.id;
    continuationIsTestJob = parentIsTestJob;
  }

  // The caller (saveResponse) has already determined that continuation
  // is warranted. This function enforces structural safety limits only.
  const underMaxContinuations = currentContinuationCount < 5;
  if (!underMaxContinuations) {
    return { enqueued: false, reason: 'continuation_limit_reached' };
  }

  deps.logger.info(`[dialectic-worker] [continueJob] Continuation required for job ${job.id}. Enqueuing new job.`);

  const newJobToInsert: JobInsert = {
    // Provide an id so tests can validate a full row shape via type guard
    id: (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    session_id: job.session_id,
    user_id: projectOwnerUserId,
    stage_slug: job.stage_slug,
    iteration_number: job.iteration_number,
    payload: continuationPayload,
    status: 'pending_continuation',
    attempt_count: 0,
    max_retries: job.max_retries,
    parent_job_id: job.parent_job_id,
    // add required fields for row validity
    created_at: new Date().toISOString(),
    is_test_job: continuationIsTestJob,
    // Ensure nullable columns exist to satisfy row type guard expectations
    job_type: continuationJobType,
    prerequisite_job_id: job.prerequisite_job_id,
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    // Align row-level target with payload target for traceability
    target_contribution_id: continuationTargetContributionId,
    idempotency_key: `${job.id}_continue_${savedOutput.id}`,
  };

  // The type of `newJobToInsert` is compatible with the `insert` method's expected type.
  const { error: insertError } = await dbClient.from('dialectic_generation_jobs').insert(newJobToInsert);
  
  if (insertError) {
    const isUniqueViolationOnIdempotencyKey =
      insertError.code === '23505' &&
      typeof insertError.message === 'string' &&
      insertError.message.includes('idempotency_key');
    if (isUniqueViolationOnIdempotencyKey) {
      deps.logger.info('[dialectic-worker] [continueJob] Continuation job already exists from prior attempt (idempotency_key), treating as success.', { jobId: job.id, savedOutputId: savedOutput.id });
      return { enqueued: true };
    }
    deps.logger.error(`[dialectic-worker] [continueJob] Failed to enqueue continuation job.`, { error: insertError });
    return {
        enqueued: false,
        error: new Error(`Failed to enqueue continuation job: ${insertError.message}`)
    };
  }

  deps.logger.info(`[dialectic-worker] [continueJob] Successfully enqueued continuation job for output ${savedOutput.id}.`);

  return { enqueued: true };
};
