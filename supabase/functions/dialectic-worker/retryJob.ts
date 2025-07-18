import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import type { FailedAttemptError } from '../dialectic-service/dialectic.interface.ts';
import type { ILogger } from '../_shared/types.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

export interface IRetryJobDeps {
  logger: ILogger;
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
      await dbClient.rpc('create_notification_for_user', {
          target_user_id: projectOwnerUserId,
          notification_type: 'contribution_generation_retrying',
          notification_data: { 
              sessionId: job.session_id, 
              stageSlug: job.stage_slug,
              attempt: currentAttempt + 1,
              max_attempts: job.max_retries + 1, // 1 initial attempt + max_retries
          },
      });
  }

  return {};
}
