import {
  AssembledPrompt,
  AssemblePlannerPromptDeps,
} from "./prompt-assembler.interface.ts";
import { isRecord } from "../utils/type_guards.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import { gatherInputsForStage } from "./gatherInputsForStage.ts";
import { renderPrompt } from "../prompt-renderer.ts";
import { FileType } from "../types/file_manager.types.ts";

export async function assemblePlannerPrompt(
  {
    dbClient,
    fileManager,
    job,
    project,
    session,
    stage,
    gatherContext,
    render,
  }: AssemblePlannerPromptDeps,
): Promise<AssembledPrompt> {
  console.log( // For debugging test failure
    "assemblePlannerPrompt called with job payload:",
    JSON.stringify(job.payload, null, 2),
  );
  if (!session.selected_model_ids || session.selected_model_ids.length === 0) {
    throw new Error(
      "PRECONDITION_FAILED: Session must have at least one selected model.",
    );
  }
  // Precondition: Ensure the job payload does not contain the deprecated step_info object.
  if (
    job.payload &&
    typeof job.payload === "object" &&
    "step_info" in job.payload
  ) {
    throw new Error(
      "PRECONDITION_FAILED: Legacy 'step_info' object found in job payload. This field is deprecated.",
    );
  }
  if (!isRecord(job.payload)) {
    throw new Error(
      "PRECONDITION_FAILED: Job payload is missing.",
    );
  }
  if (typeof job.payload.model_id !== "string") {
    throw new Error("PRECONDITION_FAILED: Job payload is missing 'model_id'.");
  }
  if (typeof job.payload.model_slug !== "string") {
    throw new Error("PRECONDITION_FAILED: Job payload is missing model_slug.");
  }
  if (!stage.recipe_step) {
    throw new Error("PRECONDITION_FAILED: Stage context is missing recipe_step.");
  }
  if (typeof project.initial_user_prompt !== "string") {
    throw new Error(
      "PRECONDITION_FAILED: Project is missing initial_user_prompt.",
    );
  }
  const initialUserPrompt = project.initial_user_prompt;

  if (!stage.recipe_step.prompt_template_id) {
    throw new Error(
      "PRECONDITION_FAILED: Stage context is missing prompt_template_id.",
    );
  }
  const { data: promptTemplateData, error: templateError } = await dbClient
    .from("system_prompts")
    .select("prompt_text")
    .eq("id", stage.recipe_step.prompt_template_id)
    .single();

  console.log( // For debugging test failure
    "DB query result:",
    JSON.stringify({ data: promptTemplateData, error: templateError }, null, 2),
  );

  if (templateError) {
    if (templateError.code !== "PGRST116") {
      throw templateError;
    }
  }

  if (!promptTemplateData) {
    throw new Error(
      `Failed to find planner prompt template with ID ${stage.recipe_step.prompt_template_id}`,
    );
  }

  // 2. Fetch Model Details
  const { data: model, error: modelError } = await dbClient
    .from("ai_providers")
    .select("name")
    .eq("id", job.payload.model_id)
    .single();

  if (modelError || !model) {
    throw new Error(
      `Failed to fetch model details for id ${job.payload.model_id}: ${
        modelError?.message
      }`,
    );
  }

  const promptTemplate = promptTemplateData.prompt_text;

  const sourceContributionId = job.target_contribution_id;

  const context = await gatherContext(
    dbClient,
    (bucket, path) => downloadFromStorage(dbClient, bucket, path),
    gatherInputsForStage,
    project,
    session,
    stage,
    initialUserPrompt,
    session.iteration_count,
  );

  const stageWithOverride = {
    ...stage,
    system_prompts: { prompt_text: promptTemplate },
  };

  const renderedPrompt = render(
    renderPrompt,
    stageWithOverride,
    context,
    project.user_domain_overlay_values,
  );

  const response = await fileManager.uploadAndRegisterFile({
    pathContext: {
      projectId: project.id,
      sessionId: session.id,
      iteration: session.iteration_count,
      stageSlug: stage.slug,
      fileType: FileType.PlannerPrompt,
      modelSlug: job.payload.model_slug,
      stepName: stage.recipe_step.step_name,
      branchKey: stage.recipe_step.branch_key,
      parallelGroup: stage.recipe_step.parallel_group,
      sourceContributionId,
    },
    resourceTypeForDb: "planner_prompt",
    fileContent: renderedPrompt,
    mimeType: "text/markdown",
    sizeBytes: new TextEncoder().encode(renderedPrompt).length,
    userId: project.user_id,
    description:
      `Planner prompt for stage: ${stage.slug}, step: ${stage.recipe_step.step_name}`,
  });

  if (response.error) {
    throw new Error(
      `Failed to save planner prompt: ${response.error.message}`,
    );
  }

  return {
    promptContent: renderedPrompt,
    source_prompt_resource_id: response.record.id,
  };
}
