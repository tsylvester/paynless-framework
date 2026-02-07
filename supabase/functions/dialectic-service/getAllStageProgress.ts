import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type { Database } from '../types_db.ts';
import {
  GetAllStageProgressPayload,
  GetAllStageProgressResult,
  GetAllStageProgressResponse,
  JobProgressEntry,
  JobProgressStatus,
  StageProgressEntry,
  StageDocumentDescriptorDto,
  StageRunDocumentStatus,
  StepJobProgress,
  UnifiedStageStatus,
} from './dialectic.interface.ts';
import { isRecord } from '../_shared/utils/type-guards/type_guards.common.ts';
import { isJobProgressEntry, isJobTypeEnum } from '../_shared/utils/type-guards/type_guards.dialectic.ts';
import { deconstructStoragePath } from '../_shared/utils/path_deconstructor.ts';

function mapJobStatusToStageRunDocumentStatus(jobStatus: string): StageRunDocumentStatus {
  if (jobStatus === 'completed') return 'completed';
  if (jobStatus === 'in_progress') return 'generating';
  if (jobStatus === 'failed') return 'failed';
  if (jobStatus === 'retrying') return 'retrying';
  return 'idle';
}

function mapJobStatusToJobProgressStatus(jobStatus: string): JobProgressStatus | null {
  if (jobStatus === 'pending') return 'pending';
  if (jobStatus === 'in_progress') return 'in_progress';
  if (jobStatus === 'retrying') return 'in_progress';
  if (jobStatus === 'completed') return 'completed';
  if (jobStatus === 'failed') return 'failed';
  return null;
}

function deriveStageStatus(jobStatuses: string[]): UnifiedStageStatus {
  if (jobStatuses.length === 0) return 'not_started';
  if (jobStatuses.some((s) => s === 'failed')) return 'failed';
  if (jobStatuses.some((s) => s === 'in_progress' || s === 'retrying')) return 'in_progress';
  if (jobStatuses.every((s) => s === 'completed')) return 'completed';
  return 'in_progress';
}

function deriveStepStatus(jobStatuses: string[]): string {
  if (jobStatuses.length === 0) return 'not_started';
  if (jobStatuses.some((s) => s === 'failed')) return 'failed';
  if (jobStatuses.some((s) => s === 'in_progress' || s === 'retrying')) return 'in_progress';
  if (jobStatuses.every((s) => s === 'completed')) return 'completed';
  return 'in_progress';
}

export async function getAllStageProgress(
  payload: GetAllStageProgressPayload,
  dbClient: SupabaseClient<Database>,
  user: User,
): Promise<GetAllStageProgressResult> {
  const { sessionId, iterationNumber, userId, projectId } = payload;

  if (
    !sessionId ||
    iterationNumber === undefined ||
    typeof iterationNumber !== 'number' ||
    !userId ||
    !projectId
  ) {
    return {
      status: 400,
      error: {
        message: 'sessionId, iterationNumber, userId, and projectId are required',
        code: 'VALIDATION_ERROR',
      },
    };
  }

  const { data: project, error: projectError } = await dbClient
    .from('dialectic_projects')
    .select('user_id')
    .eq('id', projectId)
    .single();

  if (projectError) {
    if (projectError.code === 'PGRST116') {
      return {
        status: 404,
        error: {
          message: 'Project not found.',
          code: 'NOT_FOUND',
          details: projectError.message,
        },
      };
    }
    return {
      status: 500,
      error: {
        message: 'Failed to fetch project.',
        code: 'DB_ERROR',
        details: projectError.message,
      },
    };
  }

  if (!project || project.user_id !== user.id) {
    return {
      status: 403,
      error: {
        message: 'You are not authorized to access this project.',
        code: 'FORBIDDEN',
      },
    };
  }

  const { data: jobs, error: jobsError } = await dbClient
    .from('dialectic_generation_jobs')
    .select('id, status, payload, stage_slug, job_type')
    .eq('session_id', sessionId)
    .eq('iteration_number', iterationNumber)
    .eq('user_id', userId);

  if (jobsError) {
    return {
      status: 500,
      error: {
        message: `Failed to fetch generation jobs: ${jobsError.message}`,
        code: 'DB_ERROR',
      },
    };
  }

  const { data: resources, error: resourcesError } = await dbClient
    .from('dialectic_project_resources')
    .select('id, storage_path, file_name, source_contribution_id, stage_slug')
    .eq('resource_type', 'rendered_document')
    .eq('session_id', sessionId)
    .eq('iteration_number', iterationNumber);

  if (resourcesError) {
    return {
      status: 500,
      error: {
        message: `Failed to fetch project resources: ${resourcesError.message}`,
        code: 'DB_ERROR',
      },
    };
  }

  const jobsList = jobs ?? [];
  const resourcesList = resources ?? [];

  const recipeStepIds = new Set<string>();
  for (const job of jobsList) {
    if (!isRecord(job.payload)) continue;
    const pm = job.payload.planner_metadata;
    if (!isRecord(pm) || typeof pm.recipe_step_id !== 'string' || !pm.recipe_step_id.trim()) continue;
    recipeStepIds.add(pm.recipe_step_id.trim());
  }

  const recipeStepIdToStepKey = new Map<string, string>();
  if (recipeStepIds.size > 0) {
    const { data: recipeSteps, error: stepsError } = await dbClient
      .from('dialectic_stage_recipe_steps')
      .select('id, step_key')
      .in('id', Array.from(recipeStepIds));

    if (!stepsError && recipeSteps) {
      for (const row of recipeSteps) {
        if (typeof row.id === 'string' && typeof row.step_key === 'string') {
          recipeStepIdToStepKey.set(row.id, row.step_key);
        }
      }
    }
  }

  const jobsByStageSlug = new Map<string, typeof jobsList>();
  for (const job of jobsList) {
    if (typeof job.stage_slug !== 'string' || job.stage_slug.trim().length === 0) {
      return {
        status: 500,
        error: {
          message: 'Failed to derive stageSlug from generation job row: stage_slug is missing or invalid',
          code: 'DB_ERROR',
        },
      };
    }

    const slug = job.stage_slug;
    const existing = jobsByStageSlug.get(slug) ?? [];
    existing.push(job);
    jobsByStageSlug.set(slug, existing);
  }

  const result: GetAllStageProgressResponse = [];
  const stageSlugs = Array.from(jobsByStageSlug.keys()).sort();

  for (const stageSlug of stageSlugs) {
    const stageJobs = jobsByStageSlug.get(stageSlug) ?? [];
    const stageResources = resourcesList.filter(
      (r) => r.stage_slug === stageSlug,
    );

    const resourceMapByDocumentKey = new Map<string, string>();
    const resourceMapBySourceContributionId = new Map<string, string>();

    for (const resource of stageResources) {
      if (resource.storage_path && resource.file_name) {
        const pathInfo = deconstructStoragePath({
          storageDir: resource.storage_path,
          fileName: resource.file_name,
        });
        if (pathInfo.documentKey) {
          resourceMapByDocumentKey.set(pathInfo.documentKey, resource.id);
        }
      }
      if (resource.source_contribution_id) {
        resourceMapBySourceContributionId.set(
          resource.source_contribution_id,
          resource.id,
        );
      }
    }

    const documents: StageDocumentDescriptorDto[] = [];
    const jobStatuses: string[] = [];
    const statusesByStepKey = new Map<string, string[]>();
    const progressStatusesByStepKey: Map<string, JobProgressStatus[]> = new Map<string, JobProgressStatus[]>();
    const jobTypeByStepKey: Map<string, Database['public']['Enums']['dialectic_job_type_enum']> = new Map<
      string,
      Database['public']['Enums']['dialectic_job_type_enum']
    >();
    const modelStatusesByStepKey: Map<string, Map<string, JobProgressStatus[]>> = new Map<
      string,
      Map<string, JobProgressStatus[]>
    >();

    for (const job of stageJobs) {
      const jobStatus = typeof job.status === 'string' ? job.status : '';
      jobStatuses.push(jobStatus);

      if (job.job_type === null || typeof job.job_type !== 'string' || !isJobTypeEnum(job.job_type)) {
        return {
          status: 500,
          error: {
            message: 'Failed to compute jobProgress: job_type is missing or invalid on generation job row',
            code: 'DB_ERROR',
          },
        };
      }

      const recipeStepId =
        isRecord(job.payload) && isRecord(job.payload.planner_metadata) && typeof job.payload.planner_metadata.recipe_step_id === 'string'
          ? job.payload.planner_metadata.recipe_step_id.trim()
          : null;
      const stepKey = recipeStepId ? recipeStepIdToStepKey.get(recipeStepId) ?? null : null;
      if (!stepKey) {
        return {
          status: 500,
          error: {
            message: 'Failed to compute jobProgress: planner_metadata.recipe_step_id is missing/invalid or does not map to a recipe step_key',
            code: 'DB_ERROR',
          },
        };
      }

      const arr = statusesByStepKey.get(stepKey) ?? [];
      arr.push(jobStatus);
      statusesByStepKey.set(stepKey, arr);

      const mappedProgressStatus = mapJobStatusToJobProgressStatus(jobStatus);
      if (!mappedProgressStatus) {
        return {
          status: 500,
          error: {
            message: `Failed to compute jobProgress: unsupported job status '${jobStatus}'`,
            code: 'DB_ERROR',
          },
        };
      }

      const existingJobType = jobTypeByStepKey.get(stepKey) ?? null;
      if (existingJobType && existingJobType !== job.job_type) {
        return {
          status: 500,
          error: {
            message: 'Failed to compute jobProgress: inconsistent job_type values within the same recipe step_key',
            code: 'DB_ERROR',
          },
        };
      }
      jobTypeByStepKey.set(stepKey, job.job_type);

      const progressArr = progressStatusesByStepKey.get(stepKey) ?? [];
      progressArr.push(mappedProgressStatus);
      progressStatusesByStepKey.set(stepKey, progressArr);

      if (job.job_type === 'EXECUTE') {
        if (!isRecord(job.payload) || typeof job.payload.model_id !== 'string' || job.payload.model_id.trim().length === 0) {
          return {
            status: 500,
            error: {
              message: 'Failed to compute jobProgress: EXECUTE job is missing a valid payload.model_id',
              code: 'DB_ERROR',
            },
          };
        }

        const modelId = job.payload.model_id.trim();
        const modelBuckets = modelStatusesByStepKey.get(stepKey) ?? new Map<string, JobProgressStatus[]>();
        const modelStatusArr = modelBuckets.get(modelId) ?? [];
        modelStatusArr.push(mappedProgressStatus);
        modelBuckets.set(modelId, modelStatusArr);
        modelStatusesByStepKey.set(stepKey, modelBuckets);
      }

      if (
        !isRecord(job.payload) ||
        typeof job.payload.document_key !== 'string' ||
        typeof job.payload.model_id !== 'string'
      ) {
        continue;
      }

      let latestRenderedResourceId = '';
      if (
        typeof job.payload.sourceContributionId === 'string' &&
        resourceMapBySourceContributionId.has(job.payload.sourceContributionId)
      ) {
        latestRenderedResourceId =
          resourceMapBySourceContributionId.get(
            job.payload.sourceContributionId,
          ) ?? '';
      } else {
        latestRenderedResourceId =
          resourceMapByDocumentKey.get(job.payload.document_key) ?? '';
      }

      const status = mapJobStatusToStageRunDocumentStatus(jobStatus);

      const doc: StageDocumentDescriptorDto = {
        documentKey: job.payload.document_key,
        modelId: job.payload.model_id,
        jobId: job.id,
        status,
        latestRenderedResourceId,
      };
      if (stepKey) {
        doc.stepKey = stepKey;
      }
      documents.push(doc);
    }

    const stepStatuses: Record<string, string> = {};
    for (const [key, statuses] of statusesByStepKey) {
      stepStatuses[key] = deriveStepStatus(statuses);
    }
    const stageStatus = deriveStageStatus(jobStatuses);

    const jobProgress: StepJobProgress = {};
    for (const [stepKey, statuses] of progressStatusesByStepKey) {
      const jobType = jobTypeByStepKey.get(stepKey) ?? null;
      if (!jobType) {
        return {
          status: 500,
          error: {
            message: 'Failed to compute jobProgress: job_type missing for step_key aggregation',
            code: 'DB_ERROR',
          },
        };
      }

      let completedJobs = 0;
      let inProgressJobs = 0;
      let failedJobs = 0;

      for (const st of statuses) {
        if (st === 'completed') completedJobs += 1;
        if (st === 'in_progress') inProgressJobs += 1;
        if (st === 'failed') failedJobs += 1;
      }

      const jobProgressEntry: JobProgressEntry = {
        totalJobs: statuses.length,
        completedJobs,
        inProgressJobs,
        failedJobs,
      };

      if (jobType === 'EXECUTE') {
        const modelBuckets = modelStatusesByStepKey.get(stepKey) ?? null;
        if (!modelBuckets || modelBuckets.size === 0) {
          return {
            status: 500,
            error: {
              message: 'Failed to compute jobProgress: EXECUTE step_key has no model status buckets',
              code: 'DB_ERROR',
            },
          };
        }

        const modelJobStatuses: Record<string, JobProgressStatus> = {};
        for (const [modelId, modelStatuses] of modelBuckets.entries()) {
          if (modelStatuses.some((s) => s === 'failed')) {
            modelJobStatuses[modelId] = 'failed';
            continue;
          }
          if (modelStatuses.some((s) => s === 'in_progress')) {
            modelJobStatuses[modelId] = 'in_progress';
            continue;
          }
          if (modelStatuses.some((s) => s === 'pending')) {
            modelJobStatuses[modelId] = 'pending';
            continue;
          }
          modelJobStatuses[modelId] = 'completed';
        }

        jobProgressEntry.modelJobStatuses = modelJobStatuses;
      }

      if (!isJobProgressEntry(jobProgressEntry)) {
        return {
          status: 500,
          error: {
            message: 'Failed to compute jobProgress: constructed JobProgressEntry failed validation',
            code: 'DB_ERROR',
          },
        };
      }

      jobProgress[stepKey] = jobProgressEntry;
    }

    const entry: StageProgressEntry = {
      stageSlug,
      documents,
      stepStatuses,
      stageStatus,
      jobProgress,
    };
    result.push(entry);
  }

  return {
    status: 200,
    data: result,
  };
}
