import {
  DialecticJobRow,
  DialecticProjectResourceRow,
  DialecticStage,
  DialecticStageRecipeInstance,
  GetAllStageProgressDeps,
  GetAllStageProgressParams,
  GetAllStageProgressResult,
  GetAllStageProgressResponse,
  GranularityStrategy,
  PriorStageContext,
  ProgressRecipeStep,
  ProgressRecipeEdge,
  StageDocumentDescriptorDto,
  StageProgressEntry,
  StepProgressDto,
  UnifiedStageStatus,
} from "./dialectic.interface.ts";
import { isGranularityStrategy, isJobTypeEnum } from "../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";

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

  const transitionsResponse = await dbClient
    .from("dialectic_stage_transitions")
    .select("source_stage_id, target_stage_id")
    .eq("process_template_id", processTemplateId);
  if (transitionsResponse.error) {
    const error = { message: `Failed to fetch stage transitions: ${transitionsResponse.error.message}`, status: 500 };
    return { status: 500, error };
  }
  if (!transitionsResponse.data) {
    const error = { message: "Failed to fetch stage transitions: null data", status: 500 };
    return { status: 500, error };
  }
  const transitionsData: { source_stage_id: string; target_stage_id: string }[] = transitionsResponse.data;
  const nonSelfTransitions: { source_stage_id: string; target_stage_id: string }[] = transitionsData.filter(
    (t: { source_stage_id: string; target_stage_id: string }) => t.source_stage_id !== t.target_stage_id,
  );
  const templateStageIdSet: Set<string> = new Set<string>();
  for (const t of transitionsData) {
    templateStageIdSet.add(t.source_stage_id);
    templateStageIdSet.add(t.target_stage_id);
  }
  const templateStageIds: string[] = Array.from(templateStageIdSet);
  const totalStages: number = templateStageIds.length;

  const templateStagesResponse = await dbClient
    .from("dialectic_stages")
    .select("id, slug")
    .in("id", templateStageIds);
  if (templateStagesResponse.error || !templateStagesResponse.data) {
    let templateStagesErrorMessage: string = "null";
    if (
      templateStagesResponse.error &&
      typeof templateStagesResponse.error.message === "string" &&
      templateStagesResponse.error.message.length > 0
    ) {
      templateStagesErrorMessage = templateStagesResponse.error.message;
    }
    const error = { message: `Failed to fetch template stages: ${templateStagesErrorMessage}`, status: 500 };
    return { status: 500, error };
  }
  const templateStages: { id: string; slug: string }[] = templateStagesResponse.data;

  const stageIdToStage: Map<string, { id: string; slug: string }> = new Map<string, { id: string; slug: string }>();
  for (const row of templateStages) {
    if (typeof row.id !== "string" || row.id.length === 0) {
      const error = { message: "Template stage id is null or invalid", status: 500 };
      return { status: 500, error };
    }
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      const error = { message: "Template stage slug is null or invalid", status: 500 };
      return { status: 500, error };
    }
    stageIdToStage.set(row.id, row);
  }

  const inDegree: Map<string, number> = new Map<string, number>();
  for (const stageId of templateStageIds) {
    inDegree.set(stageId, 0);
  }
  for (const t of nonSelfTransitions) {
    const target: string = t.target_stage_id;
    if (!inDegree.has(target)) {
      const error = { message: `Stage transition target not found in template stage ids: ${target}`, status: 500 };
      return { status: 500, error };
    }
    const currentInDegree: number | undefined = inDegree.get(target);
    if (typeof currentInDegree !== "number") {
      const error = { message: `Stage transition target in-degree missing for: ${target}`, status: 500 };
      return { status: 500, error };
    }
    inDegree.set(target, currentInDegree + 1);
  }
  const orderedStageIds: string[] = [];
  const queue: string[] = templateStageIds.filter((id: string) => {
    const degree: number | undefined = inDegree.get(id);
    return typeof degree === "number" && degree === 0;
  });
  while (queue.length > 0) {
    const stageIdShifted: string | undefined = queue.shift();
    if (typeof stageIdShifted !== "string" || stageIdShifted.length === 0) {
      const error = { message: "Stage queue produced invalid stage id", status: 500 };
      return { status: 500, error };
    }
    const stageId: string = stageIdShifted;
    orderedStageIds.push(stageId);
    for (const t of nonSelfTransitions) {
      if (t.source_stage_id !== stageId) continue;
      const nextId: string = t.target_stage_id;
      const currentDegree: number | undefined = inDegree.get(nextId);
      if (typeof currentDegree !== "number") {
        const error = { message: `Stage transition target in-degree missing for: ${nextId}`, status: 500 };
        return { status: 500, error };
      }
      const d: number = currentDegree - 1;
      inDegree.set(nextId, d);
      if (d === 0) queue.push(nextId);
    }
  }
  if (orderedStageIds.length !== templateStageIds.length) {
    const error = { message: "Stage transition graph contains a cycle or unresolved node", status: 500 };
    return { status: 500, error };
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
    .in("id", templateStageIds);

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
  if (stagesData.length !== templateStageIds.length) {
    const error = { message: "Stage count does not match template stage count", status: 500 };
    return { status: 500, error };
  }

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
  const stepKeyToGranularityStrategy: Map<string, GranularityStrategy> = new Map<string, GranularityStrategy>();
  const stepsByInstanceId: Map<string, ProgressRecipeStep[]> = new Map<string, ProgressRecipeStep[]>();
  const stepsByTemplateId: Map<string, ProgressRecipeStep[]> = new Map<string, ProgressRecipeStep[]>();

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
      const instanceIdUnknown: unknown = stepUnknown["instance_id"];
      const stepKeyUnknown: unknown = stepUnknown["step_key"];
      const jobTypeUnknown: unknown = stepUnknown["job_type"];
      const granularityUnknown: unknown = stepUnknown["granularity_strategy"];

      if (typeof stepIdUnknown !== "string" || stepIdUnknown.length === 0) {
        const error = { message: "Stage recipe step id is null or invalid", status: 500 };
        return { status: 500, error };
      }
      if (typeof instanceIdUnknown !== "string" || instanceIdUnknown.length === 0) {
        const error = { message: `Stage recipe step instance_id is null or invalid for step id: ${stepIdUnknown}`, status: 500 };
        return { status: 500, error };
      }
      if (typeof stepKeyUnknown !== "string" || stepKeyUnknown.length === 0) {
        const error = { message: `Stage recipe step_key is null or invalid for step id: ${stepIdUnknown}`, status: 500 };
        return { status: 500, error };
      }
      if (typeof jobTypeUnknown !== "string" || !isJobTypeEnum(jobTypeUnknown)) {
        const error = { message: `Stage recipe step job_type is null or invalid for step id: ${stepIdUnknown}`, status: 500 };
        return { status: 500, error };
      }
      if (!isGranularityStrategy(granularityUnknown)) {
        const error = { message: `Stage recipe step granularity_strategy is null or invalid for step id: ${stepIdUnknown}`, status: 500 };
        return { status: 500, error };
      }
      stepIdToStepKey.set(stepIdUnknown, stepKeyUnknown);
      stepKeyToGranularityStrategy.set(stepKeyUnknown, granularityUnknown);
      const step: ProgressRecipeStep = {
        id: stepIdUnknown,
        step_key: stepKeyUnknown,
        job_type: jobTypeUnknown,
        granularity_strategy: granularityUnknown,
      };
      const arrExisting: ProgressRecipeStep[] | undefined = stepsByInstanceId.get(instanceIdUnknown);
      const arr: ProgressRecipeStep[] = [];
      if (arrExisting) {
        arr.push(...arrExisting);
      }
      arr.push(step);
      stepsByInstanceId.set(instanceIdUnknown, arr);
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
      const templateIdUnknown: unknown = stepUnknown["template_id"];
      const stepKeyUnknown: unknown = stepUnknown["step_key"];
      const jobTypeUnknown: unknown = stepUnknown["job_type"];
      const granularityUnknown: unknown = stepUnknown["granularity_strategy"];

      if (typeof stepIdUnknown !== "string" || stepIdUnknown.length === 0) {
        const error = { message: "Template recipe step id is null or invalid", status: 500 };
        return { status: 500, error };
      }
      if (typeof templateIdUnknown !== "string" || templateIdUnknown.length === 0) {
        const error = { message: `Template recipe step template_id is null or invalid for step id: ${stepIdUnknown}`, status: 500 };
        return { status: 500, error };
      }
      if (typeof stepKeyUnknown !== "string" || stepKeyUnknown.length === 0) {
        const error = { message: `Template recipe step_key is null or invalid for step id: ${stepIdUnknown}`, status: 500 };
        return { status: 500, error };
      }
      if (typeof jobTypeUnknown !== "string" || !isJobTypeEnum(jobTypeUnknown)) {
        const error = { message: `Template recipe step job_type is null or invalid for step id: ${stepIdUnknown}`, status: 500 };
        return { status: 500, error };
      }
      if (!isGranularityStrategy(granularityUnknown)) {
        const error = { message: `Template recipe step granularity_strategy is null or invalid for step id: ${stepIdUnknown}`, status: 500 };
        return { status: 500, error };
      }
      stepIdToStepKey.set(stepIdUnknown, stepKeyUnknown);
      stepKeyToGranularityStrategy.set(stepKeyUnknown, granularityUnknown);
      const step: ProgressRecipeStep = {
        id: stepIdUnknown,
        step_key: stepKeyUnknown,
        job_type: jobTypeUnknown,
        granularity_strategy: granularityUnknown,
      };
      const arrExisting: ProgressRecipeStep[] | undefined = stepsByTemplateId.get(templateIdUnknown);
      const arr: ProgressRecipeStep[] = [];
      if (arrExisting) {
        arr.push(...arrExisting);
      }
      arr.push(step);
      stepsByTemplateId.set(templateIdUnknown, arr);
    }
  }

  const edgesByInstanceId: Map<string, ProgressRecipeEdge[]> = new Map<string, ProgressRecipeEdge[]>();
  const edgesByTemplateId: Map<string, ProgressRecipeEdge[]> = new Map<string, ProgressRecipeEdge[]>();

  if (clonedInstanceIds.length > 0) {
    const edgesResponse = await dbClient
      .from("dialectic_stage_recipe_edges")
      .select("instance_id, from_step_id, to_step_id")
      .in("instance_id", clonedInstanceIds);
    if (edgesResponse.error) {
      const error = { message: `Failed to fetch stage recipe edges: ${edgesResponse.error.message}`, status: 500 };
      return { status: 500, error };
    }
    if (!edgesResponse.data) {
      const error = { message: "Failed to fetch stage recipe edges: null data", status: 500 };
      return { status: 500, error };
    }
    const edgesData: { instance_id: string; from_step_id: string; to_step_id: string }[] = edgesResponse.data;
    for (const row of edgesData) {
      const edge: ProgressRecipeEdge = { from_step_id: row.from_step_id, to_step_id: row.to_step_id };
      const arrExisting: ProgressRecipeEdge[] | undefined = edgesByInstanceId.get(row.instance_id);
      const arr: ProgressRecipeEdge[] = [];
      if (arrExisting) {
        arr.push(...arrExisting);
      }
      arr.push(edge);
      edgesByInstanceId.set(row.instance_id, arr);
    }
  }

  if (templateIds.length > 0) {
    const templateEdgesResponse = await dbClient
      .from("dialectic_recipe_template_edges")
      .select("template_id, from_step_id, to_step_id")
      .in("template_id", templateIds);
    if (templateEdgesResponse.error) {
      const error = { message: `Failed to fetch recipe template edges: ${templateEdgesResponse.error.message}`, status: 500 };
      return { status: 500, error };
    }
    if (!templateEdgesResponse.data) {
      const error = { message: "Failed to fetch recipe template edges: null data", status: 500 };
      return { status: 500, error };
    }
    const templateEdgesData: { template_id: string; from_step_id: string; to_step_id: string }[] = templateEdgesResponse.data;
    for (const row of templateEdgesData) {
      const edge: ProgressRecipeEdge = { from_step_id: row.from_step_id, to_step_id: row.to_step_id };
      const arrExisting: ProgressRecipeEdge[] | undefined = edgesByTemplateId.get(row.template_id);
      const arr: ProgressRecipeEdge[] = [];
      if (arrExisting) {
        arr.push(...arrExisting);
      }
      arr.push(edge);
      edgesByTemplateId.set(row.template_id, arr);
    }
  }

  const stageSlugsForResources: string[] = stagesData.map((s: DialecticStage) => s.slug);
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

  const computeExpectedCountsDeps = { topologicalSortSteps: deps.topologicalSortSteps };

  const stageIdToEntry: Map<string, StageProgressEntry> = new Map<string, StageProgressEntry>();
  const priorStageContextByStageId: Map<string, PriorStageContext> = new Map<string, PriorStageContext>();

  for (const stageId of orderedStageIds) {
    const templateStage: { id: string; slug: string } | undefined = stageIdToStage.get(stageId);
    if (!templateStage) {
      const error = { message: `Template stage not found for stage id: ${stageId}`, status: 500 };
      return { status: 500, error };
    }
    const stageSlug: string = templateStage.slug;
    const stageJobs: DialecticJobRow[] = jobsData.filter((j: DialecticJobRow) => j.stage_slug === stageSlug);
    const instanceId: string | undefined = stageSlugToInstanceId.get(stageSlug);
    const stageDocs: StageDocumentDescriptorDto[] = [];
    const stageDocsMaybe: StageDocumentDescriptorDto[] | undefined = documentsByStageSlug.get(stageSlug);
    if (stageDocsMaybe) {
      stageDocs.push(...stageDocsMaybe);
    }

    if (!instanceId) {
      const error = { message: `Stage active recipe instance not found for stage: ${stageSlug}`, status: 500 };
      return { status: 500, error };
    }

    const isCloned: boolean | undefined = instanceIdToIsCloned.get(instanceId);
    if (typeof isCloned !== "boolean") {
      const error = { message: `Recipe instance clone state missing for instance: ${instanceId}`, status: 500 };
      return { status: 500, error };
    }
    const templateId: string | undefined = instanceIdToTemplateId.get(instanceId);
    if (typeof templateId !== "string" || templateId.length === 0) {
      const error = { message: `Recipe instance template id missing for instance: ${instanceId}`, status: 500 };
      return { status: 500, error };
    }

    let steps: ProgressRecipeStep[] = [];
    let edges: ProgressRecipeEdge[] = [];
    if (isCloned) {
      const stageSteps: ProgressRecipeStep[] | undefined = stepsByInstanceId.get(instanceId);
      if (!stageSteps || stageSteps.length === 0) {
        const error = { message: `No cloned recipe steps found for instance: ${instanceId}`, status: 500 };
        return { status: 500, error };
      }
      steps = stageSteps;
      const stageEdges: ProgressRecipeEdge[] | undefined = edgesByInstanceId.get(instanceId);
      if (stageEdges) {
        edges = stageEdges;
      }
    } else {
      const templateSteps: ProgressRecipeStep[] | undefined = stepsByTemplateId.get(templateId);
      if (!templateSteps || templateSteps.length === 0) {
        const error = { message: `No template recipe steps found for template: ${templateId}`, status: 500 };
        return { status: 500, error };
      }
      steps = templateSteps;
      const templateEdges: ProgressRecipeEdge[] | undefined = edgesByTemplateId.get(templateId);
      if (templateEdges) {
        edges = templateEdges;
      }
    }

    if (steps.length === 0) {
      const error = { message: `No recipe steps found for stage: ${stageSlug}`, status: 500 };
      return { status: 500, error };
    }

    const needsPriorContext: boolean = steps.some(
      (s: ProgressRecipeStep) =>
        s.granularity_strategy === "pairwise_by_origin" || s.granularity_strategy === "per_source_document_by_lineage",
    );
    let priorStageContext: PriorStageContext | undefined = undefined;
    if (needsPriorContext) {
      const predecessorStageId: string | undefined = nonSelfTransitions.find(
        (t: { source_stage_id: string; target_stage_id: string }) => t.target_stage_id === stageId,
      )?.source_stage_id;
      if (predecessorStageId) {
        priorStageContext = priorStageContextByStageId.get(predecessorStageId);
      }
    }

    let expectedResult: { expected: Map<string, number>; cardinality: Map<string, number> };
    try {
      expectedResult = deps.computeExpectedCounts(computeExpectedCountsDeps, {
        steps,
        edges,
        n,
        priorStageContext,
      });
    } catch (e) {
      let computeErrorMessage: string = "unknown error";
      if (e instanceof Error && typeof e.message === "string" && e.message.length > 0) {
        computeErrorMessage = e.message;
      } else {
        computeErrorMessage = String(e);
      }
      const error = { message: `computeExpectedCounts failed: ${computeErrorMessage}`, status: 500 };
      return { status: 500, error };
    }

    const leafStepIds: Set<string> = new Set<string>(steps.map((s: ProgressRecipeStep) => s.id));
    for (const e of edges) {
      leafStepIds.delete(e.from_step_id);
    }
    let lineageCount: number = 0;
    for (const step of steps) {
      if (leafStepIds.has(step.id)) {
        const cardinalityValue: number | undefined = expectedResult.cardinality.get(step.id);
        if (typeof cardinalityValue !== "number") {
          const error = { message: `Cardinality missing for step: ${step.id}`, status: 500 };
          return { status: 500, error };
        }
        lineageCount += cardinalityValue;
      }
    }
    const reviewerCount: number = n;
    priorStageContextByStageId.set(stageId, { lineageCount, reviewerCount });

    const stepStatusMap: Map<string, UnifiedStageStatus> = deps.deriveStepStatuses(
      {},
      { steps, edges, jobs: stageJobs, stepIdToStepKey },
    );
    const totalSteps: number = steps.length;
    let completedSteps: number = 0;
    let failedSteps: number = 0;
    const stepDtos: StepProgressDto[] = [];
    for (const step of steps) {
      const status: UnifiedStageStatus = stepStatusMap.get(step.step_key) ?? "not_started";
      if (status === "completed") completedSteps += 1;
      if (status === "failed") failedSteps += 1;
      stepDtos.push({ stepKey: step.step_key, status });
    }

    let stageStatus: UnifiedStageStatus = "not_started";
    if (failedSteps > 0) {
      stageStatus = "failed";
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
      stageIdToEntry.set(stageId, {
        stageSlug,
        status: stageStatus,
        modelCount: null,
        progress: { completedSteps, totalSteps, failedSteps },
        steps: stepDtos,
        documents: stageDocs,
      });
    } else {
      stageIdToEntry.set(stageId, {
        stageSlug,
        status: stageStatus,
        modelCount: n,
        progress: { completedSteps, totalSteps, failedSteps },
        steps: stepDtos,
        documents: stageDocs,
      });
    }
  }

  const stagesOut: StageProgressEntry[] = [];
  for (const s of templateStages) {
    const existing: StageProgressEntry | undefined = stageIdToEntry.get(s.id);
    if (!existing) {
      const error = { message: `No computed stage progress for template stage: ${s.slug}`, status: 500 };
      return { status: 500, error };
    }
    stagesOut.push(existing);
  }

  const completedStages: number = stagesOut.filter((s: StageProgressEntry) => s.status === "completed").length;
  const response: GetAllStageProgressResponse = {
    dagProgress: { completedStages, totalStages },
    stages: stagesOut,
  };
  return { status: 200, data: response };
}

