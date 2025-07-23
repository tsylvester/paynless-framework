import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../types_db.ts';
import {
  type DialecticJobPayload,
  type ProcessSimpleJobDeps,
} from '../dialectic-service/dialectic.interface.ts';

import { processSimpleJob } from './processSimpleJob.ts';
import { type IPlanComplexJobDeps, processComplexJob } from './processComplexJob.ts';
import { planComplexStage } from './task_isolator.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';

type Job = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

export interface IJobProcessors {
    processSimpleJob: typeof processSimpleJob;
    processComplexJob: typeof processComplexJob;
    planComplexStage: typeof planComplexStage;
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

  deps.logger.info(`[dialectic-worker] [processJob] Starting for job ID: ${jobId}`);

  // --- Strategy-based routing ---
  const { data: stageData, error: stageError } = await dbClient.from('dialectic_stages').select('*').eq('slug', stageSlug!).single();
  if (stageError || !stageData) throw new Error(`Stage with slug '${stageSlug}' not found.`);

  // Extract processing strategy type for explicit logic
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
    deps.logger.info(`[dialectic-worker] [processJob] Delegating job ${jobId} to task_isolator.`);
    
    const promptAssembler = new PromptAssembler(dbClient, deps.downloadFromStorage);
    const complexDeps: IPlanComplexJobDeps = {
        logger: deps.logger,
        planComplexStage: processors.planComplexStage,
        promptAssembler: promptAssembler,
        downloadFromStorage: deps.downloadFromStorage,
    };
    
    await processors.processComplexJob(dbClient, job, projectOwnerUserId, complexDeps);
  } else if (processingStrategyType === undefined) {
    // Simple path - no processing strategy defined
    await processors.processSimpleJob(dbClient, job, projectOwnerUserId, deps, authToken);
  } else {
    // Error for unrecognized processing strategy
    throw new Error(`Unsupported processing strategy encountered: ${processingStrategyType}`);
  }
}