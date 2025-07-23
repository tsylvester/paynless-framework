import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import type { FailedAttemptError } from '../dialectic-service/dialectic.interface.ts';
import type { ILogger } from '../_shared/types.ts';
import type { NotificationServiceType } from '../_shared/types/notification.service.types.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

export interface IRetryJobDeps {
  logger: ILogger;
  notificationService: NotificationServiceType;
}

export async function retryJob(
  deps: IRetryJobDeps,
  dbClient: SupabaseClient<Database>,
  job: Job,
  currentAttempt: number,
  failedContributionAttempts: FailedAttemptError[],
  projectOwnerUserId: string
): Promise<{ error?: Error }> {
  
  const { error } = await dbClient.from('dialectic_generation_jobs').update({
      status: 'retrying',
      attempt_count: currentAttempt,
      error_details: {
          failedAttempts: failedContributionAttempts.map(e => ({...e})),
      },
  }).eq('id', job.id);

  if (error) {
    const err = new Error(`Failed to update job status to 'retrying': ${error.message}`);
    deps.logger.error(`[dialectic-worker] [retryJob] ${err.message}`, { error });
    return { error: err };
  }

  if (projectOwnerUserId) {
    try {
    await deps.notificationService.sendContributionRetryingEvent({
        type: 'contribution_generation_retrying',
        sessionId: job.session_id,
        modelId: failedContributionAttempts[0]?.modelId || 'unknown', // Best effort
        iterationNumber: job.iteration_number,
        error: `Attempt ${currentAttempt} failed. Retrying...`,
        job_id: job.id,
      }, projectOwnerUserId);
    } catch (error) {
      if (error instanceof Error) {
        deps.logger.error(`[dialectic-worker] [retryJob] Failed to send notification: ${error.message}`, { error });
      } else {
        deps.logger.error(`[dialectic-worker] [retryJob] Failed to send notification: ${error}`, { error });
      }
    }
  }

  return {};
}
