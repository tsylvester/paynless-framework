import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import {
  ListStageDocumentsPayload,
  ListStageDocumentsResponse,
  StageDocumentDescriptorDto,
  StageRunDocumentStatus,
} from './dialectic.interface.ts';
import { isRecord } from '../_shared/utils/type-guards/type_guards.common.ts';
import { deconstructStoragePath } from '../_shared/utils/path_deconstructor.ts';

export async function listStageDocuments(
  payload: ListStageDocumentsPayload,
  dbClient: SupabaseClient<Database>,
): Promise<{
  status: number;
  data?: ListStageDocumentsResponse;
  error?: { message: string };
}> {
  const { sessionId, stageSlug, iterationNumber, userId, projectId } = payload;
  if (
    !sessionId || !stageSlug || iterationNumber === undefined || !userId ||
    !projectId
  ) {
    return {
      status: 400,
      error: {
        message:
          'sessionId, stageSlug, iterationNumber, userId, and projectId are required',
      },
    };
  }

  // 1. Fetch all relevant generation jobs for the session, filtering by payload attributes
  const { data: jobs, error: jobsError } = await dbClient
    .from('dialectic_generation_jobs')
    .select('id, status, payload, created_at')
    .eq('session_id', sessionId)
    .eq('payload->>stageSlug', stageSlug)
    .eq('payload->>iterationNumber', String(iterationNumber))
    .eq('user_id', userId);

  if (jobsError) {
    return {
      status: 500,
      error: {
        message: `Failed to fetch generation jobs: ${jobsError.message}`,
      },
    };
  }

  if (!jobs || jobs.length === 0) {
    return {
      status: 200,
      data: [],
    };
  }

  // 2. Fetch all relevant rendered resources using column-based filters
  const { data: resources, error: resourcesError } = await dbClient
    .from('dialectic_project_resources')
    .select('id, storage_path, file_name, source_contribution_id')
    .eq('resource_type', 'rendered_document')
    .eq('session_id', sessionId)
    .eq('stage_slug', stageSlug)
    .eq('iteration_number', iterationNumber);

  if (resourcesError) {
    return {
      status: 500,
      error: {
        message: `Failed to fetch project resources: ${resourcesError.message}`,
      },
    };
  }

  // 3. Create lookup maps for rendered resources
  // Map by document_key (fallback correlation method)
  const resourceMapByDocumentKey = new Map<string, string>();
  // Map by source_contribution_id (preferred correlation when available)
  const resourceMapBySourceContributionId = new Map<string, string>();

  if (resources) {
    for (const resource of resources) {
      // Extract document_key from file path using deconstructStoragePath
      if (resource.storage_path && resource.file_name) {
        const pathInfo = deconstructStoragePath({
          storageDir: resource.storage_path,
          fileName: resource.file_name,
        });
        if (pathInfo.documentKey) {
          resourceMapByDocumentKey.set(pathInfo.documentKey, resource.id);
        }
      }

      // Use source_contribution_id for preferred correlation when available
      if (resource.source_contribution_id) {
        resourceMapBySourceContributionId.set(
          resource.source_contribution_id,
          resource.id,
        );
      }
    }
  }

  // 4. Filter, normalize, and combine the data
  const documents: StageDocumentDescriptorDto[] = [];
  for (const job of jobs) {
    if (
      isRecord(job.payload) &&
      typeof job.payload.document_key === 'string' &&
      typeof job.payload.model_id === 'string'
    ) {
      // Correlate resource to job: prefer source_contribution_id, fall back to document_key
      let latestRenderedResourceId = '';

      // First, try correlation via source_contribution_id if job payload includes it
      if (
        typeof job.payload.sourceContributionId === 'string' &&
        resourceMapBySourceContributionId.has(job.payload.sourceContributionId)
      ) {
        latestRenderedResourceId = resourceMapBySourceContributionId.get(
          job.payload.sourceContributionId,
        ) ?? '';
      } else {
        // Fall back to document_key correlation
        latestRenderedResourceId = resourceMapByDocumentKey.get(
          job.payload.document_key,
        ) ?? '';
      }

      // Map job status to StageRunDocumentStatus
      const jobStatus = typeof job.status === 'string' ? job.status : '';
      let status: StageRunDocumentStatus = 'idle';
      if (jobStatus === 'completed') {
        status = 'completed';
      } else if (jobStatus === 'in_progress') {
        status = 'generating';
      } else if (jobStatus === 'failed') {
        status = 'failed';
      } else if (jobStatus === 'retrying') {
        status = 'retrying';
      }

      documents.push({
        documentKey: job.payload.document_key,
        modelId: job.payload.model_id,
        jobId: job.id,
        status,
        latestRenderedResourceId,
      });
    }
  }

  return {
    status: 200,
    data: documents,
  };
}
