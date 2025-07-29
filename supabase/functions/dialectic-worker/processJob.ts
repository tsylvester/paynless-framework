import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import {
  type DialecticJobPayload,
  type ProcessSimpleJobDeps,
  type DialecticExecuteJobPayload,
} from '../dialectic-service/dialectic.interface.ts';

import { processSimpleJob } from './processSimpleJob.ts';
import { type IPlanComplexJobDeps, processComplexJob } from './processComplexJob.ts';
import { planComplexStage } from './task_isolator.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';
import { processCombinationJob } from "./processCombinationJob.ts";
import { isDialecticCombinationJobPayload, isDialecticPlanJobPayload, isDialecticExecuteJobPayload, isDialecticJobRow } from '../_shared/utils/type_guards.ts';
import { getGranularityPlanner } from './strategies/granularity.strategies.ts';
import { isContributionType } from '../_shared/utils/type_guards.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

export interface IJobProcessors {
    processSimpleJob: typeof processSimpleJob;
    processComplexJob: typeof processComplexJob;
    planComplexStage: typeof planComplexStage;
    processCombinationJob: typeof processCombinationJob;
}

export async function processJob(
  dbClient: SupabaseClient<Database>,
  job: Job & { payload: DialecticJobPayload },
  projectOwnerUserId: string,
  deps: ProcessSimpleJobDeps,
  authToken: string,
  processors: IJobProcessors,
) {
  const { id: jobId } = job;
  const {
    stageSlug,
  } = job.payload;

  deps.logger.info(`[dialectic-worker] [processJob] Starting for job ID: ${jobId}, Type: ${job.payload.job_type || 'simple'}`);

  // Route first based on the explicit job type in the payload.
  if (isDialecticExecuteJobPayload(job.payload)) {
      deps.logger.info(`[dialectic-worker] [processJob] Job ${jobId} is an 'execute' job. Delegating to executor.`);
      await processors.processSimpleJob(dbClient, { ...job, payload: job.payload }, projectOwnerUserId, deps, authToken);
      return;
  }
  
  if (isDialecticCombinationJobPayload(job.payload)) {
      deps.logger.info(`[dialectic-worker] [processJob] Job ${jobId} is a 'combine' job. Delegating to combination processor.`);
      await processors.processCombinationJob(dbClient, { ...job, payload: job.payload }, projectOwnerUserId, deps, authToken);
      return;
  }
  
  // By exclusion, the job must be a 'plan' job if it reaches here.
  if (isDialecticPlanJobPayload(job.payload)) {
      const { data: stageData, error: stageError } = await dbClient.from('dialectic_stages').select('*').eq('slug', stageSlug!).single();
      if (stageError || !stageData) {
          throw new Error(`Stage with slug '${job.payload.stageSlug}' not found.`);
      }

      if (!isContributionType(stageData.slug)) {
          throw new Error(`Stage slug '${stageData.slug}' is not a valid ContributionType.`);
      }

      const processingStrategyType = (
          stageData.input_artifact_rules && 
          typeof stageData.input_artifact_rules === 'object' && 
          !Array.isArray(stageData.input_artifact_rules) &&
          'processing_strategy' in stageData.input_artifact_rules && 
          stageData.input_artifact_rules.processing_strategy &&
          typeof stageData.input_artifact_rules.processing_strategy === 'object' &&
          !Array.isArray(stageData.input_artifact_rules.processing_strategy) &&
          'type' in stageData.input_artifact_rules.processing_strategy && 
          typeof stageData.input_artifact_rules.processing_strategy.type === 'string'
      ) ? stageData.input_artifact_rules.processing_strategy.type : undefined;

      if (processingStrategyType === 'task_isolation') {
          deps.logger.info(`[dialectic-worker] [processJob] Delegating 'plan' job ${jobId} to complex planner.`);
          const promptAssembler = new PromptAssembler(dbClient, deps.downloadFromStorage);
          const complexDeps: IPlanComplexJobDeps = {
              logger: deps.logger,
              planComplexStage: processors.planComplexStage,
              promptAssembler: promptAssembler,
              downloadFromStorage: deps.downloadFromStorage,
              getGranularityPlanner: getGranularityPlanner,
          };
          
          await processors.processComplexJob(dbClient, { ...job, payload: job.payload }, projectOwnerUserId, complexDeps);
      } else {
          deps.logger.info(`[dialectic-worker] [processJob] Job ${jobId} is a 'plan' job for a simple stage. Transforming to 'execute' job in-memory.`);
          
          // Since isDialecticPlanJobPayload passed, we know job.payload has the base properties and step_info.
          const { 
            model_id,
            sessionId, 
            projectId, 
            stageSlug, 
            iterationNumber, 
            walletId, 
            continueUntilComplete, 
            maxRetries, 
            continuation_count, 
            target_contribution_id, 
            step_info,
          } = job.payload;

          if (!stageSlug || !isContributionType(stageSlug)) {
              throw new Error(`Job ${job.id} has a simple payload but its stageSlug ('${stageSlug}') is missing or not a valid ContributionType.`);
          }

          const executePayload: DialecticExecuteJobPayload = {
              job_type: 'execute',
              model_id,
              sessionId,
              projectId,
              stageSlug,
              iterationNumber,
              walletId,
              continueUntilComplete,
              maxRetries,
              continuation_count,
              target_contribution_id,
              step_info, // Pass down from the plan job
              prompt_template_name: 'default_seed_prompt',
              output_type: stageSlug,
              inputs: {},
          };


          const transformedJob = { ...job, payload: executePayload };
          if(isDialecticJobRow(transformedJob)) {
            await processors.processSimpleJob(dbClient, transformedJob, projectOwnerUserId, deps, authToken);
          } else {
            throw new Error(`Failed to transform 'plan' job ${jobId} to an 'execute' job.`);
          }
      }
  } else {
    // If it's not any of the known, typed payloads, it's a logic error.
    throw new Error(`Unsupported payload type for job ${jobId}. Payload: ${JSON.stringify(job.payload)}`);
  }
}

