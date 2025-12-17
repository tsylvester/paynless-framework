import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import {
  type DialecticJobPayload,
  type IDialecticJobDeps,
  type IJobProcessors,
} from '../dialectic-service/dialectic.interface.ts';
// Removed legacy stage-based routing; router now dispatches strictly by job.job_type

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

// Narrow by row job_type only; router intentionally ignores payload shape
function jobIsExecuteJob(
  j: Job & { payload: DialecticJobPayload },
): j is Job & { payload: import('../dialectic-service/dialectic.interface.ts').DialecticExecuteJobPayload } {
  return j.job_type === 'EXECUTE';
}

function jobIsPlanJob(
  j: Job & { payload: DialecticJobPayload },
): j is Job & { payload: import('../dialectic-service/dialectic.interface.ts').DialecticPlanJobPayload } {
  return j.job_type === 'PLAN';
}

export async function processJob(
  dbClient: SupabaseClient<Database>,
  job: Job & { payload: DialecticJobPayload },
  projectOwnerUserId: string,
  deps: IDialecticJobDeps,
  authToken: string,
  processors: IJobProcessors,
) {
  const { id: jobId } = job;

  deps.logger.info(`[dialectic-worker] [processJob] Starting for job ID: ${jobId}, Type: ${job.job_type}`);

  // Route strictly by the job row's job_type; do not query stages or sniff payload shape
  switch (job.job_type) {
    case 'EXECUTE': {
      deps.logger.info(`[dialectic-worker] [processJob] Job ${jobId} is an 'execute' job. Delegating to executor.`);
      if (jobIsExecuteJob(job)) {
        await processors.processSimpleJob(dbClient, job, projectOwnerUserId, deps, authToken);
      } else {
        throw new Error(`Unsupported or null job_type for job ${jobId}`);
      }
      return;
    }
    case 'PLAN': {
      deps.logger.info(`[dialectic-worker] [processJob] Delegating 'plan' job ${jobId} to complex planner.`);
      if (jobIsPlanJob(job)) {
        await processors.processComplexJob(dbClient, job, projectOwnerUserId, deps, authToken);
      } else {
        throw new Error(`Unsupported or null job_type for job ${jobId}`);
      }
      return;
    }
    case 'RENDER': {
      deps.logger.info(`[dialectic-worker] [processJob] Delegating 'render' job ${jobId} to renderer.`);
      await processors.processRenderJob(dbClient, job, projectOwnerUserId, deps, authToken);
      return;
    }
    default: {
      throw new Error(`Unsupported or null job_type for job ${jobId}`);
    }
  }
}

