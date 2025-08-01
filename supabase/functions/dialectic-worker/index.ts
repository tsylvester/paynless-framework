import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import {
  type IDialecticJobDeps,
  type DialecticJobPayload,
  type ExecuteModelCallAndSaveParams,
} from '../dialectic-service/dialectic.interface.ts';
import { isDialecticJobPayload } from '../_shared/utils/type_guards.ts';
import { processJob, type IJobProcessors } from './processJob.ts';
import { logger } from '../_shared/logger.ts';
import { processSimpleJob } from './processSimpleJob.ts';
import { getAiProviderConfig, processComplexJob } from './processComplexJob.ts';
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
import { FileManagerService } from '../_shared/services/file_manager.ts';
import { createSupabaseAdminClient, } from '../_shared/auth.ts';
import { NotificationService } from '../_shared/utils/notification.service.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import { getGranularityPlanner } from './strategies/granularity.strategies.ts';
import { RagService } from '../_shared/services/rag_service.ts';
import { IndexingService, LangchainTextSplitter, OpenAIEmbeddingClient } from '../_shared/services/indexing_service.ts';
import { OpenAiAdapter } from '../_shared/ai_service/openai_adapter.ts';
import { countTokensForMessages } from '../_shared/utils/tokenizer_utils.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

const processors: IJobProcessors = {
  processSimpleJob,
  processComplexJob,
  planComplexStage,
};

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  console.log('dialectic-worker serverless function called');
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
    console.log('dialectic-worker serverless function called with auth token', authToken);
    const adminClient: SupabaseClient<Database> = createSupabaseAdminClient();
    const notificationService = new NotificationService(adminClient);
    
    // --- Instantiate all services for the unified dependency object ---
    const fileManager = new FileManagerService(adminClient);
    const openAiAdapter = new OpenAiAdapter(Deno.env.get('OPENAI_API_KEY')!, logger);
    const embeddingClient = new OpenAIEmbeddingClient(openAiAdapter);
    const textSplitter = new LangchainTextSplitter();
    const indexingService = new IndexingService(adminClient, logger, textSplitter, embeddingClient);
    const ragService = new RagService({ dbClient: adminClient, logger, indexingService, embeddingClient });

    console.log('dialectic-worker serverless function called with adminClient', adminClient);
    console.log('dialectic-worker serverless function called with req', req);
    const deps: IDialecticJobDeps = {
      logger,
      getSeedPromptForStage,
      continueJob,
      retryJob,
      callUnifiedAIModel,
      downloadFromStorage: (bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
      getExtensionFromMimeType,
      randomUUID: crypto.randomUUID.bind(crypto),
      fileManager: fileManager,
      deleteFromStorage: (bucket: string, paths: string[]) => deleteFromStorage(adminClient, bucket, paths),
      notificationService,
      executeModelCallAndSave: (params: ExecuteModelCallAndSaveParams) => executeModelCallAndSave(params),
      // Add the new dependencies for complex jobs
      ragService,
      countTokens: countTokensForMessages,
      getAiProviderConfig: (dbClient: SupabaseClient<Database>, modelId: string) => getAiProviderConfig(dbClient, modelId),
      getGranularityPlanner,
      planComplexStage,
      indexingService,
      embeddingClient
    };

    // We must await the handler to ensure the serverless function
    // stays alive to complete the job processing.
    await handleJob(adminClient, job, deps, authToken, processors);

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
  deps: IDialecticJobDeps,
  authToken: string,
  processors: IJobProcessors,
): Promise<void> {
  console.log('[handleJob] Entered function for job:', job.id);
  const { id: jobId, user_id: projectOwnerUserId } = job;

  // --- Start of Validation Block ---
  console.log('[handleJob] Starting validation for job:', jobId);
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
  
  console.log(`[handleJob] user_id check PASSED for job: ${jobId}`);

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
  console.log(`[handleJob] payload check PASSED for job: ${jobId}`);
  // --- End of Validation Block ---

  try {
    console.log(`[handleJob] Validation passed. Entering TRY block for job: ${jobId}`);
    // Update job status to 'processing'
    console.log(`[handleJob] Updating job ${jobId} status to 'processing'...`);
    await adminClient.from('dialectic_generation_jobs').update({
        status: 'processing',
        started_at: new Date().toISOString(),
    }).eq('id', jobId);
    console.log(`[handleJob] Job ${jobId} status successfully updated to 'processing'.`);

    // Notify user that the job has started
    if (projectOwnerUserId) {
      console.log(`[handleJob] Sending 'started' notification for job ${jobId}...`);
      await deps.notificationService.sendContributionStartedEvent({
        type: 'contribution_generation_started',
        sessionId: job.payload.sessionId,
        job_id: jobId,
      }, projectOwnerUserId);
      console.log(`[handleJob] 'Started' notification sent for job ${jobId}.`);
    }

    const validatedJob: Job & { payload: DialecticJobPayload } = {
      ...job,
      payload: job.payload,
    };

    // Call the internal processing function with validated, typed payload
    console.log(`[handleJob] Calling processJob for job ${jobId}...`);
    await processJob(adminClient, validatedJob, projectOwnerUserId, deps, authToken, processors);
    console.log(`[handleJob] processJob completed for job ${jobId}.`);
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

      await adminClient.from('dialectic_generation_jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_details: errorDetails,
      }).eq('id', jobId);
  }
}
