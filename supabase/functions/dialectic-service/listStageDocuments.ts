import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import {
  ListStageDocumentsPayload,
  ListStageDocumentsResponse,
  StageDocumentDescriptorDto,
} from './dialectic.interface.ts';
import { isRecord } from '../_shared/utils/type-guards/type_guards.common.ts';

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
    .eq('user_id', userId)
    .eq('project_id', projectId);

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
      data: { documents: [] },
    };
  }

  // 2. Extract job IDs to create a specific filter for the next query
  const jobIds = jobs.map((job) => job.id);

  // 3. Fetch all relevant rendered resources using a highly-specific filter
  const { data: resources, error: resourcesError } = await dbClient
    .from('dialectic_project_resources')
    .select('id, resource_description')
    .eq('resource_description->>type', 'rendered_document')
    .filter('resource_description->>job_id', 'in', `(${jobIds.map((id) => `"${id}"`).join(',')})`);

  if (resourcesError) {
    return {
      status: 500,
      error: {
        message: `Failed to fetch project resources: ${resourcesError.message}`,
      },
    };
  }

  // 4. Create a lookup map for rendered resources by job_id
  const resourceMapByJobId = new Map<string, string>();
  if (resources) {
    for (const resource of resources) {
      if (
        isRecord(resource.resource_description) &&
        typeof resource.resource_description.job_id === 'string'
      ) {
        resourceMapByJobId.set(resource.resource_description.job_id, resource.id);
      }
    }
  }

  // 5. Filter, normalize, and combine the data
  const documents: StageDocumentDescriptorDto[] = [];
  for (const job of jobs) {
    if (
      isRecord(job.payload) &&
      typeof job.payload.document_key === 'string' &&
      typeof job.payload.model_id === 'string'
    ) {
      documents.push({
        documentKey: job.payload.document_key,
        modelId: job.payload.model_id,
        lastRenderedResourceId: resourceMapByJobId.get(job.id) || null,
      });
    }
  }

  return {
    status: 200,
    data: { documents },
  };
}
