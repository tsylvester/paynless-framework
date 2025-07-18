import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import {
  type GenerateContributionsDeps,
  type GenerateContributionsPayload,
} from '../dialectic-service/dialectic.interface.ts';
import { validatePayload } from "../_shared/utils/type_guards.ts";
import { processJob, type IJobProcessors } from './processJob.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

export async function handleJob(
  dbClient: SupabaseClient<Database>,
  job: Job,
  deps: GenerateContributionsDeps,
  authToken: string,
  processors: IJobProcessors,
): Promise<void> {
  const { id: jobId, user_id: projectOwnerUserId, payload: jobPayload } = job;

  // --- Start of Validation Block ---
  if (!projectOwnerUserId) {
      deps.logger.error(`[dialectic-worker] Job ${jobId} is missing a user_id and cannot be processed.`);
      await dbClient.from('dialectic_generation_jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_details: { message: 'Job is missing a user_id.' },
      }).eq('id', jobId);
      return;
  }
  
  // Validate and convert the payload
  let validatedPayload: GenerateContributionsPayload;
  try {
    validatedPayload = validatePayload(jobPayload);
  } catch (validationError) {
    const error = validationError instanceof Error ? validationError : new Error(String(validationError));
    deps.logger.error(`[dialectic-worker] Job ${jobId} has invalid payload: ${error.message}`, { error });
    await dbClient.from('dialectic_generation_jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_details: { message: `Invalid payload: ${error.message}` },
    }).eq('id', jobId);

    if (projectOwnerUserId) {
        await dbClient.rpc('create_notification_for_user', {
            target_user_id: projectOwnerUserId,
            notification_type: 'contribution_generation_failed',
            notification_data: { 
                sessionId: job.session_id, // Use from job as payload is invalid
                stageSlug: job.stage_slug, 
                reason: `An unexpected error occurred: ${error.toString()}`,
            },
        });
    }
    return;
  }
  // --- End of Validation Block ---

  try {
    // Update job status to 'processing'
    await dbClient.from('dialectic_generation_jobs').update({
        status: 'processing',
        started_at: new Date().toISOString(),
    }).eq('id', jobId);

    // Notify user that the job has started
    if (projectOwnerUserId) {
        await dbClient.rpc('create_notification_for_user', {
            target_user_id: projectOwnerUserId,
            notification_type: 'contribution_generation_started',
            notification_data: { sessionId: validatedPayload.sessionId, stageSlug: validatedPayload.stageSlug },
        });
    }

    // Call the internal processing function with validated, typed payload
    await processJob(dbClient, job, validatedPayload, projectOwnerUserId, deps, authToken, processors);
  } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      deps.logger.error(`[dialectic-worker] [handleJob] Unhandled exception during processJob for job ${jobId}`, { error });
      
      const errorDetails = {
        final_error: `Unhandled exception: ${error.message}`,
        failedAttempts: [],
      };

      await dbClient.rpc('create_notification_for_user', {
          target_user_id: projectOwnerUserId,
          notification_type: 'contribution_generation_failed',
          notification_data: { 
              sessionId: job.session_id, 
              stageSlug: job.stage_slug, 
              error: errorDetails
          },
      });
  
      await dbClient.from('dialectic_generation_jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_details: errorDetails,
      }).eq('id', jobId);
  }
}
