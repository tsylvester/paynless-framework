import { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";
import {
  DialecticJobRow,
  DialecticProjectResourceRow,
  DialecticStage,
  DialecticStageRecipeInstance,
  GetAllStageProgressPayload,
  GetAllStageProgressResult,
  GetAllStageProgressResponse,
  JobProgressEntry,
  JobProgressStatus,
  StageDocumentDescriptorDto,
  StageProgressEntry,
  StepJobProgress,
  UnifiedStageStatus,
} from "./dialectic.interface.ts";
import {
  isJobProgressEntry,
  isJobTypeEnum,
  isPlannerMetadata,
} from "../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";

export async function getAllStageProgress(
  payload: GetAllStageProgressPayload,
  dbClient: SupabaseClient<Database>,
  user: User,
): Promise<GetAllStageProgressResult> {
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

  const jobsSelect = "id, status, payload, stage_slug, job_type, parent_job_id, results, session_id, iteration_number, user_id, created_at, is_test_job, attempt_count, max_retries, prerequisite_job_id, target_contribution_id, started_at, completed_at, error_details";
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

  const jobsDataUnknown: DialecticJobRow[] | null = jobsResponse.data;
  if (!jobsDataUnknown) {
    const error = { message: "Failed to fetch jobs: null data", status: 500 };
    return { status: 500, error };
  }
  const jobsData: DialecticJobRow[] = jobsDataUnknown;

  if (jobsData.length === 0) {
    const empty: GetAllStageProgressResponse = [];
    return { status: 200, data: empty };
  }

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

  const stagesResponse = await dbClient
    .from("dialectic_stages")
    .select("id, slug, active_recipe_instance_id, created_at, display_name, description, expected_output_template_ids, default_system_prompt_id, recipe_template_id")
    .in("slug", stageSlugs);

  const stagesError = stagesResponse.error;
  if (stagesError) {
    const error = { message: `Failed to fetch stages: ${stagesError.message}`, status: 500 };
    return { status: 500, error };
  }

  const stagesDataUnknown: DialecticStage[] | null = stagesResponse.data;
  if (!stagesDataUnknown) {
    const error = { message: "Failed to fetch stages: null data", status: 500 };
    return { status: 500, error };
  }
  const stagesData: DialecticStage[] = stagesDataUnknown;

  const stageSlugToStageId: Map<string, string> = new Map<string, string>();
  for (const stage of stagesData) {
    const slugUnknown: unknown = stage.slug;
    const idUnknown: unknown = stage.id;
    if (typeof slugUnknown !== "string" || slugUnknown.length === 0 || typeof idUnknown !== "string" || idUnknown.length === 0) {
      const error = { message: "Stage id or slug is null or invalid", status: 500 };
      return { status: 500, error };
    }
    stageSlugToStageId.set(slugUnknown, idUnknown);
  }
  for (const stageSlug of stageSlugs) {
    if (!stageSlugToStageId.has(stageSlug)) {
      const error = { message: `Stage not found for slug: ${stageSlug}`, status: 500 };
      return { status: 500, error };
    }
  }

  const instanceIdSet: Set<string> = new Set<string>();
  const stageSlugToInstanceId: Map<string, string> = new Map<string, string>();
  for (const stage of stagesData) {
    const slugUnknown: unknown = stage.slug;
    const instanceIdUnknown: unknown = stage.active_recipe_instance_id;
    if (typeof slugUnknown !== "string" || slugUnknown.length === 0) {
      const error = { message: "Stage slug is null or invalid", status: 500 };
      return { status: 500, error };
    }
    if (typeof instanceIdUnknown !== "string" || instanceIdUnknown.length === 0) {
      const error = { message: `Stage active_recipe_instance_id is null or invalid for slug: ${slugUnknown}`, status: 500 };
      return { status: 500, error };
    }
    stageSlugToInstanceId.set(slugUnknown, instanceIdUnknown);
    instanceIdSet.add(instanceIdUnknown);
  }
  const instanceIds: string[] = Array.from(instanceIdSet);

  const instancesResponse = await dbClient
    .from("dialectic_stage_recipe_instances")
    .select("id, stage_id, template_id, is_cloned, cloned_at, created_at, updated_at")
    .in("id", instanceIds);

  const instancesError = instancesResponse.error;
  if (instancesError) {
    const error = { message: `Failed to fetch recipe instances: ${instancesError.message}`, status: 500 };
    return { status: 500, error };
  }

  const instancesDataUnknown: DialecticStageRecipeInstance[] | null = instancesResponse.data;
  if (!instancesDataUnknown) {
    const error = { message: "Failed to fetch recipe instances: null data", status: 500 };
    return { status: 500, error };
  }
  const instancesData: DialecticStageRecipeInstance[] = instancesDataUnknown;
  const instanceIdToInstance: Map<string, DialecticStageRecipeInstance> = new Map<string, DialecticStageRecipeInstance>();
  for (const instance of instancesData) {
    if (typeof instance.id !== "string" || instance.id.length === 0) {
      const error = { message: "Recipe instance id is null or invalid", status: 500 };
      return { status: 500, error };
    }
    instanceIdToInstance.set(instance.id, instance);
  }
  for (const instanceId of instanceIds) {
    if (!instanceIdToInstance.has(instanceId)) {
      const error = { message: `Recipe instance not found for id: ${instanceId}`, status: 500 };
      return { status: 500, error };
    }
  }

  const instanceIdToIsCloned: Map<string, boolean> = new Map<string, boolean>();
  const instanceIdToTemplateId: Map<string, string> = new Map<string, string>();
  const clonedInstanceIds: string[] = [];
  const templateIds: string[] = [];

  for (const instance of instancesData) {
    if (typeof instance.id !== "string" || instance.id.length === 0) {
      const error = { message: "Recipe instance id is null or invalid", status: 500 };
      return { status: 500, error };
    }
    const isClonedUnknown: unknown = instance.is_cloned;
    if (typeof isClonedUnknown !== "boolean") {
      const error = { message: `Recipe instance is_cloned is null or invalid for id: ${instance.id}`, status: 500 };
      return { status: 500, error };
    }
    instanceIdToIsCloned.set(instance.id, isClonedUnknown);
    const templateIdUnknown: unknown = instance.template_id;
    if (typeof templateIdUnknown !== "string" || templateIdUnknown.length === 0) {
      const error = { message: `Recipe instance template_id is null or invalid for id: ${instance.id}`, status: 500 };
      return { status: 500, error };
    }
    instanceIdToTemplateId.set(instance.id, templateIdUnknown);
    if (isClonedUnknown === true) {
      clonedInstanceIds.push(instance.id);
    } else {
      templateIds.push(templateIdUnknown);
    }
  }

  const stepIdToStepKey: Map<string, string> = new Map<string, string>();
  const stepKeyToGranularityStrategy: Map<string, string> = new Map<string, string>();

  if (clonedInstanceIds.length > 0) {
    const stepsResponse = await dbClient
      .from("dialectic_stage_recipe_steps")
      .select("id, instance_id, step_key, job_type, granularity_strategy")
      .in("instance_id", clonedInstanceIds);

    const stepsError = stepsResponse.error;
    if (stepsError) {
      const error = { message: `Failed to fetch stage recipe steps: ${stepsError.message}`, status: 500 };
      return { status: 500, error };
    }

    const stepsDataUnknown: unknown = stepsResponse.data;
    if (!stepsDataUnknown) {
      const error = { message: "Failed to fetch stage recipe steps: null data", status: 500 };
      return { status: 500, error };
    }
    if (!Array.isArray(stepsDataUnknown)) {
      const error = { message: "Failed to fetch stage recipe steps: data is not an array", status: 500 };
      return { status: 500, error };
    }
    for (const stepUnknown of stepsDataUnknown) {
      if (!isRecord(stepUnknown)) {
        const error = { message: "Stage recipe step row is invalid", status: 500 };
        return { status: 500, error };
      }
      const stepIdUnknown: unknown = stepUnknown["id"];
      const stepKeyUnknown: unknown = stepUnknown["step_key"];
      const granularityUnknown: unknown = stepUnknown["granularity_strategy"];

      if (typeof stepIdUnknown !== "string" || stepIdUnknown.length === 0) {
        const error = { message: "Stage recipe step id is null or invalid", status: 500 };
        return { status: 500, error };
      }
      if (typeof stepKeyUnknown !== "string" || stepKeyUnknown.length === 0) {
        const error = { message: `Stage recipe step_key is null or invalid for step id: ${stepIdUnknown}`, status: 500 };
        return { status: 500, error };
      }
      stepIdToStepKey.set(stepIdUnknown, stepKeyUnknown);
      if (typeof granularityUnknown === "string" && granularityUnknown.length > 0) {
        stepKeyToGranularityStrategy.set(stepKeyUnknown, granularityUnknown);
      }
    }
  }

  if (templateIds.length > 0) {
    const templateStepsResponse = await dbClient
      .from("dialectic_recipe_template_steps")
      .select("id, template_id, step_key, job_type, granularity_strategy")
      .in("template_id", templateIds);

    const templateStepsError = templateStepsResponse.error;
    if (templateStepsError) {
      const error = { message: `Failed to fetch template recipe steps: ${templateStepsError.message}`, status: 500 };
      return { status: 500, error };
    }

    const templateStepsDataUnknown: unknown = templateStepsResponse.data;
    if (!templateStepsDataUnknown) {
      const error = { message: "Failed to fetch template recipe steps: null data", status: 500 };
      return { status: 500, error };
    }
    if (!Array.isArray(templateStepsDataUnknown)) {
      const error = { message: "Failed to fetch template recipe steps: data is not an array", status: 500 };
      return { status: 500, error };
    }
    for (const stepUnknown of templateStepsDataUnknown) {
      if (!isRecord(stepUnknown)) {
        const error = { message: "Template recipe step row is invalid", status: 500 };
        return { status: 500, error };
      }
      const stepIdUnknown: unknown = stepUnknown["id"];
      const stepKeyUnknown: unknown = stepUnknown["step_key"];
      const granularityUnknown: unknown = stepUnknown["granularity_strategy"];

      if (typeof stepIdUnknown !== "string" || stepIdUnknown.length === 0) {
        const error = { message: "Template recipe step id is null or invalid", status: 500 };
        return { status: 500, error };
      }
      if (typeof stepKeyUnknown !== "string" || stepKeyUnknown.length === 0) {
        const error = { message: `Template recipe step_key is null or invalid for step id: ${stepIdUnknown}`, status: 500 };
        return { status: 500, error };
      }
      stepIdToStepKey.set(stepIdUnknown, stepKeyUnknown);
      if (typeof granularityUnknown === "string" && granularityUnknown.length > 0) {
        stepKeyToGranularityStrategy.set(stepKeyUnknown, granularityUnknown);
      }
    }
  }

  const resourcesResponse = await dbClient
    .from("dialectic_project_resources")
    .select("id, storage_path, file_name, source_contribution_id, resource_type, session_id, stage_slug, iteration_number, project_id, user_id, storage_bucket, mime_type, size_bytes, created_at, updated_at, resource_description")
    .eq("resource_type", "rendered_document")
    .eq("session_id", sessionId)
    .in("stage_slug", stageSlugs)
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

  const jobIdToJob: Map<string, DialecticJobRow> = new Map<string, DialecticJobRow>();
  for (const job of jobsData) {
    if (typeof job.id !== "string" || job.id.length === 0) {
      const error = { message: "Job id is null or invalid", status: 500 };
      return { status: 500, error };
    }
    jobIdToJob.set(job.id, job);
  }

  const resultByStageSlug: Map<string, StageProgressEntry> = new Map<string, StageProgressEntry>();

  for (const job of jobsData) {
    const stageSlugUnknown: unknown = job.stage_slug;
    if (typeof stageSlugUnknown !== "string" || stageSlugUnknown.length === 0) {
      const error = { message: "Job stage_slug is null or invalid", status: 500 };
      return { status: 500, error };
    }
    const stageSlug: string = stageSlugUnknown;
    if (!resultByStageSlug.has(stageSlug)) {
      const entry: StageProgressEntry = {
        stageSlug: stageSlug,
        documents: [],
        stepStatuses: {},
        stageStatus: "not_started",
        jobProgress: {},
      };
      resultByStageSlug.set(stageSlug, entry);
    }

    const jobTypeUnknown: unknown = job.job_type;
    if (typeof jobTypeUnknown !== "string") {
      const error = { message: "Job type is null or invalid", status: 500 };
      return { status: 500, error };
    }
    if (!isJobTypeEnum(jobTypeUnknown)) {
      const error = { message: "Job type is null or invalid", status: 500 };
      return { status: 500, error };
    }
    const jobType: string = jobTypeUnknown;

    const stageEntry: StageProgressEntry | undefined = resultByStageSlug.get(stageSlug);
    if (!stageEntry) {
      const error = { message: `Stage progress entry missing for slug: ${stageSlug}`, status: 500 };
      return { status: 500, error };
    }

    let stepKey: string | undefined = undefined;
    let modelIdForJob: string | undefined = undefined;

    const payloadUnknown: unknown = job.payload;
    if (!isRecord(payloadUnknown)) {
      const error = { message: "Job payload is null or invalid", status: 500 };
      return { status: 500, error };
    }
    const p: Record<PropertyKey, unknown> = payloadUnknown;
    const modelIdUnknown: unknown = p["model_id"];
    if (typeof modelIdUnknown !== "string" || modelIdUnknown.length === 0) {
      const error = { message: "Job payload model_id is null or invalid", status: 500 };
      return { status: 500, error };
    }
    modelIdForJob = modelIdUnknown;

    if (jobType === "EXECUTE") {
      const plannerMetadataUnknown: unknown = p["planner_metadata"];
      if (isPlannerMetadata(plannerMetadataUnknown)) {
        const recipeStepIdUnknown: unknown = plannerMetadataUnknown.recipe_step_id;
        if (typeof recipeStepIdUnknown === "string" && recipeStepIdUnknown.length > 0) {
          const mapped: string | undefined = stepIdToStepKey.get(recipeStepIdUnknown);
          if (mapped) {
            stepKey = mapped;
          } else {
            const error = { message: `planner_metadata.recipe_step_id not found in recipe steps: ${recipeStepIdUnknown}`, status: 500 };
            return { status: 500, error };
          }
        }
      }
    }

    if ((jobType === "EXECUTE" || jobType === "RENDER") && !stepKey && typeof job.parent_job_id === "string" && job.parent_job_id.length > 0) {
      const parent: DialecticJobRow | undefined = jobIdToJob.get(job.parent_job_id);
      if (!parent) {
        const error = { message: `Parent job not found for id: ${job.parent_job_id}`, status: 500 };
        return { status: 500, error };
      }
      const parentPayloadUnknown: unknown = parent.payload;
      if (!isRecord(parentPayloadUnknown)) {
        const error = { message: `Parent job payload is null or invalid for id: ${parent.id}`, status: 500 };
        return { status: 500, error };
      }
      const pp: Record<PropertyKey, unknown> = parentPayloadUnknown;
      const parentPlannerMetadataUnknown: unknown = pp["planner_metadata"];
      if (isPlannerMetadata(parentPlannerMetadataUnknown)) {
        const parentRecipeStepIdUnknown: unknown = parentPlannerMetadataUnknown.recipe_step_id;
        if (typeof parentRecipeStepIdUnknown === "string" && parentRecipeStepIdUnknown.length > 0) {
          const mapped: string | undefined = stepIdToStepKey.get(parentRecipeStepIdUnknown);
          if (mapped) {
            stepKey = mapped;
          } else {
            const error = { message: `Parent planner_metadata.recipe_step_id not found in recipe steps: ${parentRecipeStepIdUnknown}`, status: 500 };
            return { status: 500, error };
          }
        }
      }
    }

    if (jobType === "EXECUTE" && !stepKey) {
      const error = { message: `EXECUTE job is missing recipe step association: ${job.id}`, status: 500 };
      return { status: 500, error };
    }

    const jobStatusUnknown: unknown = job.status;
    if (typeof jobStatusUnknown !== "string" || jobStatusUnknown.length === 0) {
      const error = { message: "Job status is null or invalid", status: 500 };
      return { status: 500, error };
    }
    const jobStatusRaw: string = jobStatusUnknown;
    let mappedStatus: JobProgressStatus;
    if (jobStatusRaw === "pending") {
      mappedStatus = "pending";
    } else if (jobStatusRaw === "in_progress" || jobStatusRaw === "retrying") {
      mappedStatus = "in_progress";
    } else if (jobStatusRaw === "completed") {
      mappedStatus = "completed";
    } else if (jobStatusRaw === "failed") {
      mappedStatus = "failed";
    } else {
      const error = { message: `Job status is unsupported: ${jobStatusRaw}`, status: 500 };
      return { status: 500, error };
    }

    const jobProgressKey: string = (() => {
      if (jobType === "RENDER") {
        return `__job:${job.id}`;
      }
      if (jobType === "PLAN" && !stepKey) {
        return `__job:${job.id}`;
      }
      if (!stepKey) {
        return `__job:${job.id}`;
      }
      return stepKey;
    })();

    const jobProgress: StepJobProgress = stageEntry.jobProgress;
    const existingProgress: JobProgressEntry | undefined = jobProgress[jobProgressKey];

    const isPerModel: boolean = (() => {
      if (jobType !== "EXECUTE") {
        return false;
      }
      if (!stepKey) {
        return false;
      }
      const granularityUnknown: string | undefined = stepKeyToGranularityStrategy.get(stepKey);
      if (!granularityUnknown) {
        return false;
      }
      return granularityUnknown === "per_model";
    })();

    const completedDelta: number = mappedStatus === "completed" ? 1 : 0;
    const inProgressDelta: number = mappedStatus === "in_progress" ? 1 : 0;
    const failedDelta: number = mappedStatus === "failed" ? 1 : 0;

    let updatedProgress: JobProgressEntry;
    if (!existingProgress) {
      const created: JobProgressEntry = {
        totalJobs: 1,
        completedJobs: completedDelta,
        inProgressJobs: inProgressDelta,
        failedJobs: failedDelta,
      };
      if (isPerModel) {
        const modelStatuses: Record<string, JobProgressStatus> = {
          [modelIdForJob]: mappedStatus,
        };
        created.modelJobStatuses = modelStatuses;
      }
      updatedProgress = created;
    } else {
      const next: JobProgressEntry = {
        totalJobs: existingProgress.totalJobs + 1,
        completedJobs: existingProgress.completedJobs + completedDelta,
        inProgressJobs: existingProgress.inProgressJobs + inProgressDelta,
        failedJobs: existingProgress.failedJobs + failedDelta,
        modelJobStatuses: existingProgress.modelJobStatuses,
      };

      if (isPerModel) {
        const existingModelStatuses: Record<string, JobProgressStatus> | undefined = existingProgress.modelJobStatuses;
        if (!existingModelStatuses) {
          const error = { message: `Missing modelJobStatuses for per_model step: ${jobProgressKey}`, status: 500 };
          return { status: 500, error };
        }
        const nextModelStatuses: Record<string, JobProgressStatus> = {
          ...existingModelStatuses,
          [modelIdForJob]: mappedStatus,
        };
        next.modelJobStatuses = nextModelStatuses;
      }

      updatedProgress = next;
    }

    if (!isJobProgressEntry(updatedProgress)) {
      const error = { message: "Job progress entry validation failed", status: 500 };
      return { status: 500, error };
    }
    jobProgress[jobProgressKey] = updatedProgress;

    if (jobType === "RENDER") {
      if (mappedStatus !== "completed") {
        continue;
      }

      const docKeyUnknown: unknown = p["documentKey"];
      if (typeof docKeyUnknown !== "string" || docKeyUnknown.length === 0) {
        const error = { message: `RENDER job payload documentKey is null or invalid for job: ${job.id}`, status: 500 };
        return { status: 500, error };
      }
      const documentKey: string = docKeyUnknown;

      const sourceContributionIdUnknown: unknown = p["sourceContributionId"];
      if (typeof sourceContributionIdUnknown !== "string" || sourceContributionIdUnknown.length === 0) {
        const error = { message: `RENDER job payload sourceContributionId is null or invalid for job: ${job.id}`, status: 500 };
        return { status: 500, error };
      }
      const sourceContributionId: string = sourceContributionIdUnknown;
      const latestRenderedResourceId: string | undefined = resourceIdBySourceContributionId.get(sourceContributionId);
      if (!latestRenderedResourceId) {
        const error = { message: `Rendered resource not found for RENDER job sourceContributionId: ${sourceContributionId}`, status: 500 };
        return { status: 500, error };
      }

      let documentStepKey: string | undefined = undefined;
      if (typeof job.parent_job_id === "string" && job.parent_job_id.length > 0) {
        if (!stepKey) {
          const error = { message: `RENDER job parent association could not be derived for job: ${job.id}`, status: 500 };
          return { status: 500, error };
        }
        documentStepKey = stepKey;
      }

      const documentStatus: StageDocumentDescriptorDto["status"] = "completed";
      const descriptor: StageDocumentDescriptorDto = {
        documentKey: documentKey,
        modelId: modelIdForJob,
        jobId: job.id,
        status: documentStatus,
        latestRenderedResourceId: latestRenderedResourceId,
        stepKey: documentStepKey,
      };
      stageEntry.documents.push(descriptor);
    }
  }

  for (const stageEntry of resultByStageSlug.values()) {
    const stepStatuses: Record<string, string> = {};
    for (const [stepKey, progress] of Object.entries(stageEntry.jobProgress)) {
      if (stepKey.startsWith("__job:")) {
        continue;
      }
      let stepStatus: string = "not_started";
      if (progress.failedJobs > 0) stepStatus = "failed";
      else if (progress.inProgressJobs > 0) stepStatus = "in_progress";
      else if (progress.completedJobs > 0 && progress.completedJobs === progress.totalJobs) stepStatus = "completed";
      stageEntry.stepStatuses[stepKey] = stepStatus;
      stepStatuses[stepKey] = stepStatus;
    }

    let stageStatus: UnifiedStageStatus = "not_started";
    let total: number = 0;
    let completed: number = 0;
    let inProgress: number = 0;
    let failed: number = 0;
    for (const progress of Object.values(stageEntry.jobProgress)) {
      total = total + progress.totalJobs;
      completed = completed + progress.completedJobs;
      inProgress = inProgress + progress.inProgressJobs;
      failed = failed + progress.failedJobs;
    }
    if (failed > 0) {
      stageStatus = "failed";
    } else if (inProgress > 0) {
      stageStatus = "in_progress";
    } else if (total > 0 && completed === total) {
      stageStatus = "completed";
    }
    stageEntry.stageStatus = stageStatus;
  }

  const response: GetAllStageProgressResponse = Array.from(resultByStageSlug.values());
  return { status: 200, data: response };
}

