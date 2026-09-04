import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { countTokens as countTokensAnthropic } from 'npm:@anthropic-ai/tokenizer@0.0.4';
import { getEncoding as rawGetEncoding } from 'npm:js-tiktoken@1.0.7';
import { Database, TablesUpdate } from '../../types_db.ts';
import {
  DialecticJobPayload,
  DialecticExecuteJobPayload,
  DialecticJobRow,
  DialecticPlanJobPayload,
  IJobProcessors,
} from '../../dialectic-service/dialectic.interface.ts';
import type { DialecticCompressJobPayload } from '../enqueueCompressJobs/enqueueCompressJobs.interface.ts';
import { isDialecticCompressJobPayload } from '../enqueueCompressJobs/enqueueCompressJobs.guard.ts';
import type { ProcessCompressJobDeps, ProcessCompressJobParams } from '../processCompressJob/processCompressJob.interface.ts';
import { isProcessCompressJobErrorReturn } from '../processCompressJob/processCompressJob.guard.ts';
import type { BoundAssembleCompressionPromptFn } from '../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.interface.ts';
import type { BoundAssembleContinuationPromptFn } from '../../_shared/prompt-assembler/prompt-assembler.interface.ts';
import { renderPrompt } from '../../_shared/prompt-renderer.ts';
import { constructStoragePath } from '../../_shared/utils/path_constructor.ts';
import { isKnownTiktokenEncoding } from '../../_shared/utils/type-guards/type_guards.chat.ts';
import { IJobContext, IPlanJobContext, IRenderJobContext } from '../createJobContext/JobContext.interface.ts';
import {
  createPlanJobContext,
  createRenderJobContext,
} from '../createJobContext/createJobContext.ts';

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
        await processors.processSimpleJob(dbClient, job, projectOwnerUserId, ctx, authToken);
      } else {
        throw new Error(`Unsupported or null job_type for job ${jobId}`);
      }
      return;
    }
    case 'PLAN': {
      ctx.logger.info(`[dialectic-worker] [processJob] Delegating 'plan' job ${jobId} to complex planner.`);
      if (jobIsPlanJob(job)) {
        const planCtx: IPlanJobContext = createPlanJobContext(ctx);
        await processors.processComplexJob(dbClient, job, projectOwnerUserId, planCtx, authToken);
      } else {
        throw new Error(`Unsupported or null job_type for job ${jobId}`);
      }
      return;
    }
    case 'RENDER': {
      ctx.logger.info(`[dialectic-worker] [processJob] Delegating 'render' job ${jobId} to renderer.`);
      const renderCtx: IRenderJobContext = createRenderJobContext(ctx);
      await processors.processRenderJob(dbClient, job, projectOwnerUserId, renderCtx, authToken);
      return;
    }
    case 'COMPRESS': {
      ctx.logger.info(`[dialectic-worker] [processJob] Delegating 'compress' job ${jobId} to compressor.`);

      if (!isDialecticCompressJobPayload(job.payload)) {
        throw new Error(`Invalid COMPRESS payload for job ${jobId}`);
      }

      const compressPayload: DialecticCompressJobPayload = job.payload;

      const boundAssembleCompressionPrompt: BoundAssembleCompressionPromptFn = (assembleParams, assemblePayload) =>
        ctx.promptAssembler.assembleCompressionPrompt(
          { dbClient, renderPromptFn: renderPrompt, logger: ctx.logger, fileManager: ctx.fileManager, constructStoragePath },
          assembleParams,
          assemblePayload,
        );

      const boundAssembleContinuationPrompt: BoundAssembleContinuationPromptFn = (continuationJob) =>
        ctx.promptAssembler.assembleContinuationPrompt({
          dbClient,
          fileManager: ctx.fileManager,
          job: continuationJob,
          downloadFromStorage: (bucket, path) => ctx.downloadFromStorage(dbClient, bucket, path),
          constructStoragePath,
        });

      const compressDeps: ProcessCompressJobDeps = {
        assembleCompressionPrompt: boundAssembleCompressionPrompt,
        assembleContinuationPrompt: boundAssembleContinuationPrompt,
        enqueueModelCall: ctx.enqueueModelCall,
        countTokens: ctx.countTokens,
        getEncoding: (encodingName: string) => {
          if (!isKnownTiktokenEncoding(encodingName)) {
            throw new Error(`Unsupported tiktoken encoding: ${encodingName}`);
          }
          return rawGetEncoding(encodingName);
        },
        countTokensAnthropic,
        constructStoragePath,
        logger: ctx.logger,
      };

      const compressParams: ProcessCompressJobParams = {
        dbClient,
        job,
        projectOwnerUserId,
        authToken,
      };

      const result = await processors.processCompressJob(
        compressDeps,
        compressParams,
        compressPayload,
      );

      if (isProcessCompressJobErrorReturn(result)) {
        const { error, retriable } = result;
        const updatePayload: TablesUpdate<'dialectic_generation_jobs'> = {
          status: 'failed',
          error_details: { message: error.message, retriable },
        };
        const { error: updateError } = await dbClient
          .from('dialectic_generation_jobs')
          .update(updatePayload)
          .eq('id', jobId);
        if (updateError) {
          throw updateError;
        }
      }

      return;
    }

    default: {
      throw new Error(`Unsupported or null job_type for job ${jobId}`);
    }
  }
}

