import {
  DialecticJobRow,
  DialecticProjectResourceRow,
  GetAllStageProgressDeps,
  GetAllStageProgressParams,
  GetAllStageProgressResult,
  GetAllStageProgressResponse,
  JobProgressDto,
  ProgressRecipeStep,
  ProgressRecipeEdge,
  StageDocumentDescriptorDto,
  StageProgressEntry,
  StepProgressDto,
  UnifiedStageStatus,
} from "./dialectic.interface.ts";
import type { StageCountsEntry } from "./computeTemplateStageCounts/computeTemplateStageCounts.interface.ts";
import type { Tables } from "../types_db.ts";
import { buildComputeTemplateStageCountsDeps, buildComputeTemplateStageCountsPayload, buildComputeTemplateStageCountsParams } from "./computeTemplateStageCounts/computeTemplateStageCounts.mock.ts";

export async function getAllStageProgress(
  deps: GetAllStageProgressDeps,
  params: GetAllStageProgressParams,
): Promise<GetAllStageProgressResult> {
  const payload = params.payload;
  const dbClient = deps.dbClient;
  const user = deps.user;
  const sessionId: string = payload.sessionId;
  const iterationNumber: number = payload.iterationNumber;
  const userId: string = payload.userId;
  const projectId: string = payload.projectId;

  if (!sessionId || !userId || !projectId || !Number.isFinite(iterationNumber)) {
    const error = { message: "sessionId, iterationNumber, userId, and projectId are required", status: 400 };
    return { status: 400, error };
  }

  if (!user || user.id !== userId) {
    const error = { message: "User not authorized for getAllStageProgress", status: 401 };
    return { status: 401, error };
  }

  const sessionResponse = await dbClient
    .from("dialectic_sessions")
    .select("id, project_id, selected_model_ids")
    .eq("id", sessionId)
    .single();
  if (sessionResponse.error || !sessionResponse.data) {
    let sessionErrorMessage: string = "not found";
    if (sessionResponse.error && typeof sessionResponse.error.message === "string" && sessionResponse.error.message.length > 0) {
      sessionErrorMessage = sessionResponse.error.message;
    }
    const error = { message: `Failed to fetch session: ${sessionErrorMessage}`, status: 500 };
    return { status: 500, error };
  }
  const sessionRow: { id: string; project_id: string; selected_model_ids: string[] | null } = sessionResponse.data;
  if (!Array.isArray(sessionRow.selected_model_ids)) {
    const error = { message: "Session selected_model_ids is null or invalid", status: 500 };
    return { status: 500, error };
  }
  const n: number = sessionRow.selected_model_ids.length;

  const projectResponse = await dbClient
    .from("dialectic_projects")
    .select("id, process_template_id")
    .eq("id", projectId)
    .single();
  if (projectResponse.error || !projectResponse.data) {
    let projectErrorMessage: string = "not found";
    if (projectResponse.error && typeof projectResponse.error.message === "string" && projectResponse.error.message.length > 0) {
      projectErrorMessage = projectResponse.error.message;
    }
    const error = { message: `Failed to fetch project: ${projectErrorMessage}`, status: 500 };
    return { status: 500, error };
  }
  const projectRow: { id: string; process_template_id: string | null } = projectResponse.data;
  const processTemplateId: string | null = projectRow.process_template_id;
  if (!processTemplateId) {
    const error = { message: "Project has no process template", status: 500 };
    return { status: 500, error };
  }

  const countsResult = await deps.computeTemplateStageCounts(
    buildComputeTemplateStageCountsDeps({
      dbClient,
      topologicalSortSteps: deps.topologicalSortSteps,
      computeExpectedCounts: deps.computeExpectedCounts,
    }),
    buildComputeTemplateStageCountsParams(),
    buildComputeTemplateStageCountsPayload({ processTemplateId, modelCount: n }),
  );
  if (countsResult.error) {
    const countsStatus: number = typeof countsResult.status === "number" ? countsResult.status : 500;
    return { status: countsStatus, error: countsResult.error };
  }
  if (!countsResult.data) {
    const error = { message: "computeTemplateStageCounts returned no data", status: 500 };
    return { status: 500, error };
  }
  const countsStages: StageCountsEntry[] = countsResult.data.stages;
  const totalStages: number = countsResult.data.totalStages;
  const stepIdToStepKey: Map<string, string> = countsResult.data.stepIdToStepKey;

  const countsStageSlugSet: Set<string> = new Set<string>();
  for (const countsEntry of countsStages) {
    countsStageSlugSet.add(countsEntry.stageSlug);
  }

  const jobsSelect = "id, status, payload, stage_slug, job_type, parent_job_id, results, session_id, iteration_number, user_id, created_at, is_test_job, attempt_count, max_retries, prerequisite_job_id, target_contribution_id, started_at, completed_at, error_details, idempotency_key";
  const jobsResponse = await dbClient
    .from("dialectic_generation_jobs")
    .select(jobsSelect)
    .eq("session_id", sessionId)
    .eq("iteration_number", iterationNumber)
    .eq("user_id", userId);

  const jobsError = jobsResponse.error;
  if (jobsError) {
    const error = { message: `Failed to fetch jobs: ${jobsError.message}`, status: 500 };
    return { status: 500, error };
  }

  const jobsDataUnknown: Tables<'dialectic_generation_jobs'>[] | null = jobsResponse.data;
  if (!jobsDataUnknown) {
    const error = { message: "Failed to fetch jobs: null data", status: 500 };
    return { status: 500, error };
  }
  const jobsData: DialecticJobRow[] = jobsDataUnknown;

  const stageSlugSet: Set<string> = new Set<string>();
  for (const job of jobsData) {
    const stageSlugUnknown: unknown = job.stage_slug;
    if (typeof stageSlugUnknown !== "string" || stageSlugUnknown.length === 0) {
      const error = { message: "Job stage_slug is null or invalid", status: 500 };
      return { status: 500, error };
    }
    stageSlugSet.add(stageSlugUnknown);
  }
  const stageSlugs: string[] = Array.from(stageSlugSet);

  for (const stageSlug of stageSlugs) {
    if (!countsStageSlugSet.has(stageSlug)) {
      const error = { message: `Stage not found for slug: ${stageSlug}`, status: 500 };
      return { status: 500, error };
    }
  }

  const stageSlugsForResources: string[] = countsStages.map((entry: StageCountsEntry) => entry.stageSlug);

  const resourcesResponse = await dbClient
    .from("dialectic_project_resources")
    .select("id, storage_path, file_name, source_contribution_id, resource_type, session_id, stage_slug, iteration_number, project_id, user_id, storage_bucket, mime_type, size_bytes, created_at, updated_at, resource_description")
    .eq("resource_type", "rendered_document")
    .eq("session_id", sessionId)
    .in("stage_slug", stageSlugsForResources)
    .eq("iteration_number", iterationNumber);

  const resourcesError = resourcesResponse.error;
  if (resourcesError) {
    const error = { message: `Failed to fetch project resources: ${resourcesError.message}`, status: 500 };
    return { status: 500, error };
  }

  const resourcesDataUnknown: DialecticProjectResourceRow[] | null = resourcesResponse.data;
  if (!resourcesDataUnknown) {
    const error = { message: "Failed to fetch project resources: null data", status: 500 };
    return { status: 500, error };
  }
  const resourcesData: DialecticProjectResourceRow[] = resourcesDataUnknown;

  const bestResourceBySourceContributionId: Map<string, DialecticProjectResourceRow> = new Map<string, DialecticProjectResourceRow>();

  for (const resource of resourcesData) {
    if (typeof resource.id !== "string" || resource.id.length === 0) {
      const error = { message: "Project resource id is null or invalid", status: 500 };
      return { status: 500, error };
    }
    if (typeof resource.source_contribution_id !== "string" || resource.source_contribution_id.length === 0) {
      const error = { message: `Project resource source_contribution_id is null or invalid for resource: ${resource.id}`, status: 500 };
      return { status: 500, error };
    }
    if (typeof resource.updated_at !== "string" || resource.updated_at.length === 0) {
      const error = { message: `Project resource updated_at is null or invalid for resource: ${resource.id}`, status: 500 };
      return { status: 500, error };
    }
    if (typeof resource.created_at !== "string" || resource.created_at.length === 0) {
      const error = { message: `Project resource created_at is null or invalid for resource: ${resource.id}`, status: 500 };
      return { status: 500, error };
    }

    const updatedAtMs: number = Date.parse(resource.updated_at);
    if (!Number.isFinite(updatedAtMs)) {
      const error = { message: `Project resource updated_at is not a valid date for resource: ${resource.id}`, status: 500 };
      return { status: 500, error };
    }
    const createdAtMs: number = Date.parse(resource.created_at);
    if (!Number.isFinite(createdAtMs)) {
      const error = { message: `Project resource created_at is not a valid date for resource: ${resource.id}`, status: 500 };
      return { status: 500, error };
    }

    const existing: DialecticProjectResourceRow | undefined = bestResourceBySourceContributionId.get(resource.source_contribution_id);
    if (!existing) {
      bestResourceBySourceContributionId.set(resource.source_contribution_id, resource);
      continue;
    }

    if (typeof existing.updated_at !== "string" || existing.updated_at.length === 0) {
      const error = { message: `Project resource updated_at is null or invalid for resource: ${existing.id}`, status: 500 };
      return { status: 500, error };
    }
    if (typeof existing.created_at !== "string" || existing.created_at.length === 0) {
      const error = { message: `Project resource created_at is null or invalid for resource: ${existing.id}`, status: 500 };
      return { status: 500, error };
    }
    const existingUpdatedAtMs: number = Date.parse(existing.updated_at);
    if (!Number.isFinite(existingUpdatedAtMs)) {
      const error = { message: `Project resource updated_at is not a valid date for resource: ${existing.id}`, status: 500 };
      return { status: 500, error };
    }
    const existingCreatedAtMs: number = Date.parse(existing.created_at);
    if (!Number.isFinite(existingCreatedAtMs)) {
      const error = { message: `Project resource created_at is not a valid date for resource: ${existing.id}`, status: 500 };
      return { status: 500, error };
    }

    let isNewer: boolean = false;
    if (updatedAtMs > existingUpdatedAtMs) {
      isNewer = true;
    } else if (updatedAtMs === existingUpdatedAtMs) {
      if (createdAtMs > existingCreatedAtMs) {
        isNewer = true;
      } else if (createdAtMs === existingCreatedAtMs) {
        if (resource.id > existing.id) {
          isNewer = true;
        }
      }
    }

    if (isNewer) {
      bestResourceBySourceContributionId.set(resource.source_contribution_id, resource);
    }
  }

  const resourceIdBySourceContributionId: Map<string, string> = new Map<string, string>();
  for (const [sourceContributionId, resource] of bestResourceBySourceContributionId.entries()) {
    resourceIdBySourceContributionId.set(sourceContributionId, resource.id);
  }

  // Walk continuation chains so RENDER jobs referencing an original contribution
  // can find the resource keyed under a continuation contribution.
  // Query contributions for this session to get target_contribution_id relationships.
  const contributionsResponse = await dbClient
    .from("dialectic_contributions")
    .select("id, target_contribution_id")
    .eq("session_id", sessionId)
    .eq("iteration_number", iterationNumber);
  if (contributionsResponse.error) {
    const error = { message: `Failed to fetch contributions for continuation chain: ${contributionsResponse.error.message}`, status: 500 };
    return { status: 500, error };
  }
  if (contributionsResponse.data) {
    // target_contribution_id on a continuation row points to the original.
    // Build forward map: original → continuation (the contribution that continued it).
    const originalToContinuation: Map<string, string> = new Map<string, string>();
    for (const row of contributionsResponse.data) {
      const contribId: unknown = row.id;
      const targetId: unknown = row.target_contribution_id;
      if (typeof contribId === "string" && contribId.length > 0 &&
          typeof targetId === "string" && targetId.length > 0) {
        originalToContinuation.set(targetId, contribId);
      }
    }
    // For each original contribution that has a continuation chain,
    // walk forward to find the final continuation. If the final continuation
    // has a resource, map the original (and all intermediates) to that resource.
    for (const startId of originalToContinuation.keys()) {
      if (resourceIdBySourceContributionId.has(startId)) {
        continue;
      }
      // Walk the chain forward: startId → continuation → continuation → ...
      const chain: string[] = [startId];
      let currentId: string = startId;
      let depth = 0;
      while (depth < 20) {
        const nextId: string | undefined = originalToContinuation.get(currentId);
        if (!nextId) break;
        chain.push(nextId);
        currentId = nextId;
        depth += 1;
      }
      // Find the first ID in the chain that has a resource (typically the last)
      let resourceId: string | undefined;
      for (let i: number = chain.length - 1; i >= 0; i--) {
        resourceId = resourceIdBySourceContributionId.get(chain[i]);
        if (resourceId) break;
      }
      if (resourceId) {
        for (const id of chain) {
          if (!resourceIdBySourceContributionId.has(id)) {
            resourceIdBySourceContributionId.set(id, resourceId);
          }
        }
      }
    }
  }

  const jobIdToJob: Map<string, DialecticJobRow> = new Map<string, DialecticJobRow>();
  for (const job of jobsData) {
    if (typeof job.id !== "string" || job.id.length === 0) {
      const error = { message: "Job id is null or invalid", status: 500 };
      return { status: 500, error };
    }
    jobIdToJob.set(job.id, job);
  }

  const documentsByStageSlug: Map<string, StageDocumentDescriptorDto[]> = deps.buildDocumentDescriptors(
    {},
    {
      jobs: jobsData,
      resourceIdBySourceContributionId,
      stepIdToStepKey,
      jobIdToJob,
    },
  );

  const jobsByStageSlug: Map<string, JobProgressDto[]> = deps.buildJobProgressDtos(
    {},
    { jobs: jobsData, stepIdToStepKey },
  );

  const stagesOut: StageProgressEntry[] = [];
  for (const entry of countsStages) {
    const stageSlug: string = entry.stageSlug;
    const steps: ProgressRecipeStep[] = entry.steps;
    const edges: ProgressRecipeEdge[] = entry.edges;
    const stageJobs: DialecticJobRow[] = jobsData.filter((j: DialecticJobRow) => j.stage_slug === stageSlug);
    const stageDocs: StageDocumentDescriptorDto[] = [];
    const stageDocsMaybe: StageDocumentDescriptorDto[] | undefined = documentsByStageSlug.get(stageSlug);
    if (stageDocsMaybe) {
      stageDocs.push(...stageDocsMaybe);
    }
    const stageJobDtos: JobProgressDto[] = jobsByStageSlug.get(stageSlug) ?? [];

    const stepStatusMap: Map<string, UnifiedStageStatus> = deps.deriveStepStatuses(
      {},
      { steps, edges, jobs: stageJobs, stepIdToStepKey },
    );
    const totalSteps: number = steps.length;
    let completedSteps: number = 0;
    let failedSteps: number = 0;
    let pausedNsfSteps: number = 0;
    let pausedUserSteps: number = 0;
    const stepDtos: StepProgressDto[] = [];
    for (const step of steps) {
      const status: UnifiedStageStatus = stepStatusMap.get(step.step_key) ?? "not_started";
      if (status === "completed") completedSteps += 1;
      if (status === "failed") failedSteps += 1;
      if (status === "paused_nsf") pausedNsfSteps += 1;
      if (status === "paused_user") pausedUserSteps += 1;
      stepDtos.push({ stepKey: step.step_key, status });
    }

    let stageStatus: UnifiedStageStatus = "not_started";
    if (failedSteps > 0) {
      stageStatus = "failed";
    } else if (pausedNsfSteps > 0) {
      stageStatus = "paused_nsf";
    } else if (pausedUserSteps > 0) {
      stageStatus = "paused_user";
    } else if (completedSteps === totalSteps && failedSteps === 0) {
      stageStatus = "completed";
    } else if (completedSteps > 0 || failedSteps > 0) {
      stageStatus = "in_progress";
    } else {
      const anyInProgressOrCompleted: boolean = stepDtos.some(
        (d: StepProgressDto) => d.status === "in_progress" || d.status === "completed",
      );
      if (anyInProgressOrCompleted) {
        stageStatus = "in_progress";
      }
    }

    if (stageStatus === "not_started") {
      stagesOut.push({
        stageSlug,
        status: stageStatus,
        modelCount: null,
        progress: { completedSteps, totalSteps, failedSteps },
        expectedCount: entry.totalExpected,
        steps: stepDtos,
        documents: stageDocs,
        jobs: stageJobDtos,
        edges,
      });
    } else {
      stagesOut.push({
        stageSlug,
        status: stageStatus,
        modelCount: n,
        progress: { completedSteps, totalSteps, failedSteps },
        expectedCount: entry.totalExpected,
        steps: stepDtos,
        documents: stageDocs,
        jobs: stageJobDtos,
        edges,
      });
    }
  }

  const completedStages: number = stagesOut.filter((s: StageProgressEntry) => s.status === "completed").length;
  const response: GetAllStageProgressResponse = {
    dagProgress: { completedStages, totalStages },
    stages: stagesOut,
  };
  return { status: 200, data: response };
}
