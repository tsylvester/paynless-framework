import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import {
  DialecticJobPayload,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DialecticPlanJobPayload,
  IJobProcessors,
} from '../dialectic-service/dialectic.interface.ts';
import { IJobContext } from './JobContext.interface.ts';
import {
  createExecuteJobContext,
  createPlanJobContext,
  createRenderJobContext,
} from './createJobContext.ts';

// Narrow by row job_type only; router dispatches strictly by job.job_type
function jobIsExecuteJob(
  j: DialecticJobRow & { payload: DialecticJobPayload },
): j is DialecticJobRow & { payload: DialecticExecuteJobPayload } {
  return j.job_type === 'EXECUTE';
}

function jobIsPlanJob(
  j: DialecticJobRow & { payload: DialecticJobPayload },
): j is DialecticJobRow & { payload: DialecticPlanJobPayload } {
  return j.job_type === 'PLAN';
}

export async function processJob(
  dbClient: SupabaseClient<Database>,
  job: DialecticJobRow & { payload: DialecticJobPayload },
  projectOwnerUserId: string,
  processors: IJobProcessors,
  ctx: IJobContext,
  authToken: string,
): Promise<void> {
  const { id: jobId } = job;

  ctx.logger.info(`[dialectic-worker] [processJob] Starting for job ID: ${jobId}, Type: ${job.job_type}`);

  // Route strictly by the job row's job_type; do not query stages or sniff payload shape
  switch (job.job_type) {
    case 'EXECUTE': {
      ctx.logger.info(`[dialectic-worker] [processJob] Job ${jobId} is an 'execute' job. Delegating to executor.`);
      if (jobIsExecuteJob(job)) {
        const executeCtx = createExecuteJobContext(ctx);
        await processors.processSimpleJob(dbClient, job, projectOwnerUserId, executeCtx, authToken);
      } else {
        throw new Error(`Unsupported or null job_type for job ${jobId}`);
      }
      return;
    }
    case 'PLAN': {
      ctx.logger.info(`[dialectic-worker] [processJob] Delegating 'plan' job ${jobId} to complex planner.`);
      if (jobIsPlanJob(job)) {
        const planCtx = createPlanJobContext(ctx);
        await processors.processComplexJob(dbClient, job, projectOwnerUserId, planCtx, authToken);
      } else {
        throw new Error(`Unsupported or null job_type for job ${jobId}`);
      }
      return;
    }
    case 'RENDER': {
      ctx.logger.info(`[dialectic-worker] [processJob] Delegating 'render' job ${jobId} to renderer.`);
      const renderCtx = createRenderJobContext(ctx);
      await processors.processRenderJob(dbClient, job, projectOwnerUserId, renderCtx, authToken);
      return;
    }
    default: {
      throw new Error(`Unsupported or null job_type for job ${jobId}`);
    }
  }
}

