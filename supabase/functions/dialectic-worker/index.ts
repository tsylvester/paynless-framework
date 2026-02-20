import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import {
  DialecticJobPayload,
  ExecuteModelCallAndSaveParams,
  IJobProcessors,
} from '../dialectic-service/dialectic.interface.ts';
import { isDialecticJobPayload } from '../_shared/utils/type_guards.ts';
import { processJob } from './processJob.ts';
import { logger } from '../_shared/logger.ts';
import { processSimpleJob } from './processSimpleJob.ts';
import { processComplexJob } from './processComplexJob.ts';
import { planComplexStage } from './task_isolator.ts';
import { getSeedPromptForStage } from '../_shared/utils/dialectic_utils.ts';
import { continueJob } from './continueJob.ts';
import { retryJob } from './retryJob.ts';
import { callUnifiedAIModel } from '../dialectic-service/callModel.ts';
import {
  downloadFromStorage,
  deleteFromStorage,
} from '../_shared/supabase_storage_utils.ts';
import { getExtensionFromMimeType } from '../_shared/path_utils.ts';
import { extractSourceGroupFragment } from '../_shared/utils/path_utils.ts';
import { constructStoragePath } from '../_shared/utils/path_constructor.ts';
import { FileManagerService } from '../_shared/services/file_manager.ts';
import { createSupabaseAdminClient, } from '../_shared/auth.ts';
import { NotificationService } from '../_shared/utils/notification.service.ts';
import { PromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import { getGranularityPlanner } from './strategies/granularity.strategies.ts';
import { RagService } from '../_shared/services/rag_service.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import { IndexingService, LangchainTextSplitter, EmbeddingClient } from '../_shared/services/indexing_service.ts';
import { countTokens } from '../_shared/utils/tokenizer_utils.ts';
import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts';
import { defaultProviderMap } from '../_shared/ai_service/factory.ts';
import { TokenWalletService } from '../_shared/services/tokenWalletService.ts';
import { processRenderJob } from './processRenderJob.ts';
import { isAiModelExtendedConfig } from '../_shared/utils/type_guards.ts';
import { renderDocument } from '../_shared/services/document_renderer.ts';
import { shouldEnqueueRenderJob } from '../_shared/utils/shouldEnqueueRenderJob.ts';
import { IJobContext } from './JobContext.interface.ts';
import { createJobContext } from './createJobContext.ts';
import { findSourceDocuments } from './findSourceDocuments.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

// Factory to create fully-wired worker dependencies
export async function createDialecticWorkerDeps(
  adminClient: SupabaseClient<Database>,
): Promise<IJobContext> {
  const notificationService = new NotificationService(adminClient);

  // Fetch the model provider for default embedding
  const { data: modelProvider, error: modelConfigError } = await adminClient
    .from('ai_providers')
    .select('*')
    .eq('is_default_embedding', true)
    .single();

  if (modelConfigError || !modelProvider) {
    throw new Error('Failed to fetch model provider for the default OpenAI embedding model.');
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const fileManager = new FileManagerService(adminClient, { constructStoragePath, logger });

  const embeddingAdapter = getAiProviderAdapter({
    provider: modelProvider,
    apiKey,
    logger,
    providerMap: defaultProviderMap,
  });
  if (!embeddingAdapter) {
    throw new Error('Failed to create an embedding adapter for the embedding client.');
  }

  const embeddingClient = new EmbeddingClient(embeddingAdapter);
  const textSplitter = new LangchainTextSplitter();
  const tokenWalletService = new TokenWalletService(adminClient, adminClient);
  const indexingService = new IndexingService(adminClient, logger, textSplitter, embeddingClient, tokenWalletService);
  const ragService = new RagService({ dbClient: adminClient, logger, indexingService, embeddingClient, tokenWalletService });
  const promptAssembler = new PromptAssembler(adminClient, fileManager);
  const documentRenderer = { renderDocument };

  return createJobContext({
    logger,
    fileManager,
    downloadFromStorage,
    deleteFromStorage,
    callUnifiedAIModel,
    getAiProviderAdapter,
    getAiProviderConfig: async (dbClient: SupabaseClient<Database>, modelId: string) => {
      const { data, error } = await dbClient
        .from('ai_providers')
        .select('*')
        .eq('id', modelId)
        .single();
      if (error || !data) {
        throw new Error('Failed to fetch AI provider config');
      }
      if (!isAiModelExtendedConfig(data.config)) {
        throw new Error('Failed to fetch AI provider config');
      }
      return data.config;
    },
    ragService,
    indexingService,
    embeddingClient,
    countTokens,
    tokenWalletService,
    notificationService,
    getSeedPromptForStage,
    promptAssembler,
    getExtensionFromMimeType,
    extractSourceGroupFragment,
    randomUUID: crypto.randomUUID.bind(crypto),
    shouldEnqueueRenderJob,
    getGranularityPlanner,
    planComplexStage,
    findSourceDocuments,
    documentRenderer,
    continueJob,
    retryJob,
    executeModelCallAndSave: (params: ExecuteModelCallAndSaveParams) =>
      executeModelCallAndSave({
        ...params,
        compressionStrategy: getSortedCompressionCandidates,
      }),
  });
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  //console.log('dialectic-worker serverless function called');
  try {
    const { record: job } = await req.json();

    if (!job) {
      throw new Error('Request body is missing `record` property.');
    }

    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authToken) {
      console.log('dialectic-worker serverless function called without auth token');
      throw new Error('Missing authorization header.');
    }
    //console.log('dialectic-worker serverless function called with auth token', authToken);
    const adminClient: SupabaseClient<Database> = createSupabaseAdminClient();
    const deps = await createDialecticWorkerDeps(adminClient);

    // We must await the handler to ensure the serverless function
    // stays alive to complete the job processing.
    await handleJob(adminClient, job, deps, authToken);

    return new Response(JSON.stringify({ message: 'Job accepted and processing started' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('[dialectic-worker-entry] Failed to process incoming job request', { error: err });
    return new Response(JSON.stringify({ error: `Failed to process job: ${err.message}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

export async function handleJob(
  adminClient: SupabaseClient<Database>,
  job: Job,
  deps: IJobContext,
  authToken: string,
  testProcessors?: IJobProcessors
): Promise<void> {
  const defaultProcessors: IJobProcessors = {
    processSimpleJob: async (dbClient, executeJob, projectOwnerUserId, _executeCtx, token) => {
      await processSimpleJob(dbClient, executeJob, projectOwnerUserId, deps, token);
    },
    processComplexJob: async (dbClient, planJob, projectOwnerUserId, planCtx, token) => {
      await processComplexJob(dbClient, planJob, projectOwnerUserId, planCtx, token);
    },
    planComplexStage: async (dbClient, parentJob, planCtx, recipeStep, token, completedSourceDocumentIds) => {
      return await planComplexStage(dbClient, parentJob, planCtx, recipeStep, token, completedSourceDocumentIds);
    },
    processRenderJob: async (dbClient, renderJob, projectOwnerUserId, renderCtx, token) => {
      await processRenderJob(dbClient, renderJob, projectOwnerUserId, renderCtx, token);
    },
  };
  const effectiveProcessors = testProcessors || defaultProcessors;
  //console.log('[handleJob] Entered function for job:', job.id);
  const { id: jobId, user_id: projectOwnerUserId } = job;
  const isTestRunner = job.payload && typeof job.payload === 'object' && 'is_test_runner_context' in job.payload 
    ? job.payload.is_test_runner_context 
    : false;

  // Diagnostic: worker entry before any status updates
  deps.logger.info('[dialectic-worker] [handleJob] worker_entry', {
    jobId,
    incomingStatus: job.status,
    phase: 'worker_entry',
    isTestRunner,
  });
  
  // Log for the unit test to capture
  if (isTestRunner) {
    deps.logger.info(`[handleJob] context_check`, { jobId: job.id, isTestRunner });
  }

  // --- Start of Validation Block ---
  //console.log('[handleJob] Starting validation for job:', jobId);
  if (!projectOwnerUserId) {
      console.error(`[handleJob] Validation FAILED for job ${jobId}: Missing user_id.`);
      deps.logger.error(`[dialectic-worker] Job ${jobId} is missing a user_id and cannot be processed.`);
      await adminClient.from('dialectic_generation_jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_details: { message: 'Job is missing a user_id.' },
      }).eq('id', jobId);
      console.log(`[handleJob] Job ${jobId} status updated to failed.`);
      return;
  }
  
  //console.log(`[handleJob] user_id check PASSED for job: ${jobId}`);

  // Validate the payload using the type guard
  if (!job.payload || !isDialecticJobPayload(job.payload)) {
    const errorMessage = 'Job payload is invalid or missing required fields.';
    console.error(`[handleJob] Validation FAILED for job ${jobId}: ${errorMessage}`);
    deps.logger.error(`[dialectic-worker] Job ${jobId} has invalid payload: ${errorMessage}`);
    await adminClient.from('dialectic_generation_jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_details: { message: `Invalid payload: ${errorMessage}` },
    }).eq('id', jobId);
    console.log(`[handleJob] Job ${jobId} status updated to failed due to invalid payload.`);

    if (projectOwnerUserId) {
        let projectId = '';
        if (job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) && 'projectId' in job.payload && typeof job.payload['projectId'] === 'string') {
            projectId = job.payload['projectId'];
        }

        // Internal failure event for UI state routing
        await deps.notificationService.sendContributionGenerationFailedEvent({
          type: 'other_generation_failed',
          sessionId: job.session_id,
          job_id: jobId,
          error: { code: 'VALIDATION_ERROR', message: errorMessage },
        }, projectOwnerUserId);

        await deps.notificationService.sendContributionFailedNotification({
            type: 'contribution_generation_failed',
            sessionId: job.session_id,
            projectId: projectId,
            stageSlug: job.stage_slug,
            error: {
                code: 'VALIDATION_ERROR',
                message: `An unexpected error occurred: ${errorMessage}`,
            },
            job_id: jobId,
        }, projectOwnerUserId);
        console.log(`[handleJob] Failure notification sent for job: ${jobId}`);
    }
    return;
  }
  //console.log(`[handleJob] payload check PASSED for job: ${jobId}`);
  // --- End of Validation Block ---

  try {
    // Atomic check-and-update: only update if status is NOT 'processing'
    // This prevents race conditions where multiple concurrent calls could both pass the check
    const { data: updatedJob, error: updateError } = await adminClient
      .from('dialectic_generation_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .neq('status', 'processing')
      .neq('status', 'waiting_for_prerequisite')
      .select()
      .single();

    if (updateError || !updatedJob) {
      throw new Error(`Job ${jobId} is already processing or could not be updated.`);
    }

    // Notify user that the job has started
    if (projectOwnerUserId) {
      //console.log(`[handleJob] Sending 'started' notification for job ${jobId}...`);
      await deps.notificationService.sendContributionStartedEvent({
        type: 'contribution_generation_started',
        sessionId: job.payload.sessionId,
        job_id: jobId,
        modelId: job.payload.model_id,
        iterationNumber: job.payload.iterationNumber ?? 0,
      }, projectOwnerUserId);
      //console.log(`[handleJob] 'Started' notification sent for job ${jobId}.`);
    }

    const validatedJob: Job & { payload: DialecticJobPayload } = {
      ...job,
      payload: job.payload,
    };

    // Call the internal processing function with validated, typed payload
    //console.log(`[handleJob] Calling processJob for job ${jobId}...`);
    await processJob(adminClient, validatedJob, projectOwnerUserId, effectiveProcessors, deps, authToken);
    //console.log(`[handleJob] processJob completed for job ${jobId}.`);
  } catch (e) {
      console.error(`[handleJob] CATCH block entered for job ${jobId}. Error:`, e);
      const error = e instanceof Error ? e : new Error(String(e));
      deps.logger.error(`[dialectic-worker] [handleJob] Unhandled exception during processJob for job ${jobId}`, { error });

      const errorDetails = {
        final_error: `Unhandled exception: ${error.message}`,
        failedAttempts: [],
      };

      let projectId = '';
      if (job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) && 'projectId' in job.payload && typeof job.payload.projectId === 'string') {
          projectId = job.payload.projectId;
      }

      await deps.notificationService.sendContributionFailedNotification({
        type: 'contribution_generation_failed',
        sessionId: job.session_id,
        projectId: projectId,
        stageSlug: job.stage_slug,
        error: { code: 'UNHANDLED_EXCEPTION', message: error.message },
        job_id: jobId,
      }, projectOwnerUserId);

      // Internal failure event for UI state routing
      await deps.notificationService.sendContributionGenerationFailedEvent({
        type: 'other_generation_failed',
        sessionId: job.session_id,
        job_id: jobId,
        error: { code: 'UNHANDLED_EXCEPTION', message: error.message },
      }, projectOwnerUserId);

      await adminClient.from('dialectic_generation_jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_details: errorDetails,
      }).eq('id', jobId);
  }
}
