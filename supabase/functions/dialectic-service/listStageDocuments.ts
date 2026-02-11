import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import {
  ListStageDocumentsPayload,
  ListStageDocumentsResponse,
  StageDocumentDescriptorDto,
  StageRunDocumentStatus,
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
    .eq('user_id', userId);

  if (jobsError) {
    return {
      status: 500,
      error: {
        message: `Failed to fetch generation jobs: ${jobsError.message}`,
      },
    };
  }

  if (!jobs) {
    return {
      status: 500,
      error: {
        message: 'Failed to fetch generation jobs: null data',
      },
    };
  }

  if (jobs.length === 0) {
    return {
      status: 200,
      data: [],
    };
  }

  // 2. Fetch all relevant rendered resources using column-based filters
  const { data: resources, error: resourcesError } = await dbClient
    .from('dialectic_project_resources')
    .select('id, source_contribution_id, updated_at, created_at')
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

  if (!resources) {
    return {
      status: 500,
      error: {
        message: 'Failed to fetch project resources: null data',
      },
    };
  }

  // 3. Create lookup map for rendered resources by source_contribution_id.
  // Multiple resources per source_contribution_id are valid (edit/regenerate); select the latest deterministically.
  const bestUpdatedAtMsBySourceContributionId = new Map<string, number>();
  const bestCreatedAtMsBySourceContributionId = new Map<string, number>();
  const bestResourceIdBySourceContributionId = new Map<string, string>();

  for (const resourceUnknown of resources) {
    if (!isRecord(resourceUnknown)) {
      return { status: 500, error: { message: 'Project resource row is invalid' } };
    }

    const idUnknown: unknown = resourceUnknown['id'];
    const sourceContributionIdUnknown: unknown = resourceUnknown['source_contribution_id'];
    const updatedAtUnknown: unknown = resourceUnknown['updated_at'];
    const createdAtUnknown: unknown = resourceUnknown['created_at'];

    if (typeof idUnknown !== 'string' || idUnknown.length === 0) {
      return { status: 500, error: { message: 'Project resource id is null or invalid' } };
    }
    if (typeof sourceContributionIdUnknown !== 'string' || sourceContributionIdUnknown.length === 0) {
      continue;
    }
    if (typeof updatedAtUnknown !== 'string' || updatedAtUnknown.length === 0) {
      return { status: 500, error: { message: `Project resource updated_at is null or invalid for resource: ${idUnknown}` } };
    }
    if (typeof createdAtUnknown !== 'string' || createdAtUnknown.length === 0) {
      return { status: 500, error: { message: `Project resource created_at is null or invalid for resource: ${idUnknown}` } };
    }

    const updatedAtMs: number = Date.parse(updatedAtUnknown);
    if (!Number.isFinite(updatedAtMs)) {
      return { status: 500, error: { message: `Project resource updated_at is not a valid date for resource: ${idUnknown}` } };
    }
    const createdAtMs: number = Date.parse(createdAtUnknown);
    if (!Number.isFinite(createdAtMs)) {
      return { status: 500, error: { message: `Project resource created_at is not a valid date for resource: ${idUnknown}` } };
    }

    const bestUpdatedAtMs: number | undefined = bestUpdatedAtMsBySourceContributionId.get(sourceContributionIdUnknown);
    const bestCreatedAtMs: number | undefined = bestCreatedAtMsBySourceContributionId.get(sourceContributionIdUnknown);
    const bestResourceId: string | undefined = bestResourceIdBySourceContributionId.get(sourceContributionIdUnknown);

    if (bestUpdatedAtMs === undefined || bestCreatedAtMs === undefined || bestResourceId === undefined) {
      bestUpdatedAtMsBySourceContributionId.set(sourceContributionIdUnknown, updatedAtMs);
      bestCreatedAtMsBySourceContributionId.set(sourceContributionIdUnknown, createdAtMs);
      bestResourceIdBySourceContributionId.set(sourceContributionIdUnknown, idUnknown);
      continue;
    }

    let isNewer: boolean = false;
    if (updatedAtMs > bestUpdatedAtMs) {
      isNewer = true;
    } else if (updatedAtMs === bestUpdatedAtMs) {
      if (createdAtMs > bestCreatedAtMs) {
        isNewer = true;
      } else if (createdAtMs === bestCreatedAtMs) {
        if (idUnknown > bestResourceId) {
          isNewer = true;
        }
      }
    }

    if (isNewer) {
      bestUpdatedAtMsBySourceContributionId.set(sourceContributionIdUnknown, updatedAtMs);
      bestCreatedAtMsBySourceContributionId.set(sourceContributionIdUnknown, createdAtMs);
      bestResourceIdBySourceContributionId.set(sourceContributionIdUnknown, idUnknown);
    }
  }

  const resourceMapBySourceContributionId = bestResourceIdBySourceContributionId;

  // 4. Filter, normalize, and combine the data
  const documents: StageDocumentDescriptorDto[] = [];
  for (const job of jobs) {
    if (typeof job.id !== 'string' || job.id.length === 0) {
      return { status: 500, error: { message: 'Job id is null or invalid' } };
    }
    if (!isRecord(job.payload)) {
      continue;
    }

    const payloadRecord: Record<PropertyKey, unknown> = job.payload;
    const documentKeyUnknown: unknown = payloadRecord['document_key'];
    const modelIdUnknown: unknown = payloadRecord['model_id'];
    const sourceContributionIdUnknown: unknown = payloadRecord['sourceContributionId'];

    if (typeof documentKeyUnknown !== 'string' || documentKeyUnknown.length === 0) {
      continue;
    }
    if (typeof modelIdUnknown !== 'string' || modelIdUnknown.length === 0) {
      return { status: 500, error: { message: 'Job payload model_id is null or invalid' } };
    }
    if (typeof sourceContributionIdUnknown !== 'string' || sourceContributionIdUnknown.length === 0) {
      continue;
    }

    const latestRenderedResourceId: string | undefined = resourceMapBySourceContributionId.get(sourceContributionIdUnknown);
    if (!latestRenderedResourceId) {
      continue;
    }

    const jobStatusUnknown: unknown = job.status;
    if (typeof jobStatusUnknown !== 'string' || jobStatusUnknown.length === 0) {
      return { status: 500, error: { message: 'Job status is null or invalid' } };
    }

    let status: StageRunDocumentStatus;
    if (jobStatusUnknown === 'completed') {
      status = 'completed';
    } else if (jobStatusUnknown === 'in_progress') {
      status = 'generating';
    } else if (jobStatusUnknown === 'failed') {
      status = 'failed';
    } else if (jobStatusUnknown === 'retrying') {
      status = 'retrying';
    } else {
      return { status: 500, error: { message: `Job status is unsupported: ${jobStatusUnknown}` } };
    }

    documents.push({
      documentKey: documentKeyUnknown,
      modelId: modelIdUnknown,
      jobId: job.id,
      status,
      latestRenderedResourceId,
    });
  }

  return {
    status: 200,
    data: documents,
  };
}
