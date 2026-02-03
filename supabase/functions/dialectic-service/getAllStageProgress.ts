import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type { Database } from '../types_db.ts';
import {
  GetAllStageProgressPayload,
  GetAllStageProgressResult,
  GetAllStageProgressResponse,
  StageProgressEntry,
  StageDocumentDescriptorDto,
  StageRunDocumentStatus,
  UnifiedStageStatus,
} from './dialectic.interface.ts';
import { isRecord } from '../_shared/utils/type-guards/type_guards.common.ts';
import { deconstructStoragePath } from '../_shared/utils/path_deconstructor.ts';

function mapJobStatusToStageRunDocumentStatus(jobStatus: string): StageRunDocumentStatus {
  if (jobStatus === 'completed') return 'completed';
  if (jobStatus === 'in_progress') return 'generating';
  if (jobStatus === 'failed') return 'failed';
  if (jobStatus === 'retrying') return 'retrying';
  return 'idle';
}

function deriveStageStatus(jobStatuses: string[]): UnifiedStageStatus {
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
    .select('id, status, payload, created_at')
    .eq('session_id', sessionId)
    .eq('payload->>iterationNumber', String(iterationNumber))
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

  const jobsByStageSlug = new Map<string, typeof jobsList>();
  for (const job of jobsList) {
    if (isRecord(job.payload) && typeof job.payload.stageSlug === 'string') {
      const slug = job.payload.stageSlug;
      const existing = jobsByStageSlug.get(slug) ?? [];
      existing.push(job);
      jobsByStageSlug.set(slug, existing);
    }
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

    for (const job of stageJobs) {
      jobStatuses.push(typeof job.status === 'string' ? job.status : '');

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

      const jobStatus = typeof job.status === 'string' ? job.status : '';
      const status = mapJobStatusToStageRunDocumentStatus(jobStatus);

      documents.push({
        documentKey: job.payload.document_key,
        modelId: job.payload.model_id,
        jobId: job.id,
        status,
        latestRenderedResourceId,
      });
    }

    const stepStatuses: Record<string, string> = {};
    const stageStatus = deriveStageStatus(jobStatuses);

    const entry: StageProgressEntry = {
      stageSlug,
      documents,
      stepStatuses,
      stageStatus,
    };
    result.push(entry);
  }

  return {
    status: 200,
    data: result,
  };
}
