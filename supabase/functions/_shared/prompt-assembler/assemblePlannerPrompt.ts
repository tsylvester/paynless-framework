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
    projectInitialUserPrompt,
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

  if (!stage.recipe_step.prompt_template_id) {
    throw new Error(
      "PRECONDITION_FAILED: Stage context is missing prompt_template_id.",
    );
  }
  const { data: promptTemplateData, error: templateError } = await dbClient
    .from("system_prompts")
    .select("prompt_text, document_template_id")
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

  // 3. Resolve template content: either from inline prompt_text or from storage via document_template_id
  let promptTemplate: string;

  if (promptTemplateData.prompt_text && promptTemplateData.prompt_text.trim().length > 0) {
    // Backward compatibility: use inline prompt_text when available
    promptTemplate = promptTemplateData.prompt_text;
  } else if (
    promptTemplateData.document_template_id &&
    typeof promptTemplateData.document_template_id === "string" &&
    promptTemplateData.document_template_id.trim().length > 0
  ) {
    // Fetch template from storage using document_template_id
    const { data: templateRecord, error: templateRecordError } = await dbClient
      .from("dialectic_document_templates")
      .select("storage_bucket, storage_path, file_name")
      .eq("id", promptTemplateData.document_template_id)
      .single();

    if (templateRecordError) {
      throw templateRecordError;
    }

    if (!templateRecord) {
      throw new Error(
        `Failed to find document template with ID ${promptTemplateData.document_template_id}`,
      );
    }

    if (
      !templateRecord.storage_bucket ||
      typeof templateRecord.storage_bucket !== "string" ||
      templateRecord.storage_bucket.trim().length === 0
    ) {
      throw new Error(
        "Invalid template record: missing storage_bucket, storage_path, or file_name",
      );
    }

    if (
      !templateRecord.storage_path ||
      typeof templateRecord.storage_path !== "string" ||
      templateRecord.storage_path.trim().length === 0
    ) {
      throw new Error(
        "Invalid template record: missing storage_bucket, storage_path, or file_name",
      );
    }

    if (
      !templateRecord.file_name ||
      typeof templateRecord.file_name !== "string" ||
      templateRecord.file_name.trim().length === 0
    ) {
      throw new Error(
        "Invalid template record: missing storage_bucket, storage_path, or file_name",
      );
    }

    const fullPath =
      `${templateRecord.storage_path.replace(/\/$/, "")}/${templateRecord.file_name}`;

    const { data: downloadedData, error: downloadError } = await downloadFromStorage(
      dbClient,
      templateRecord.storage_bucket,
      fullPath,
    );

    if (downloadError) {
      throw new Error(
        `Failed to download template from storage: ${downloadError.message}`,
      );
    }

    if (!downloadedData) {
      throw new Error("Failed to download template from storage: No data returned");
    }

    // Decode the downloaded content
    // downloadFromStorage returns ArrayBuffer | null, and we've already checked for null
    // The checklist requires checking for both ArrayBuffer and Blob, but the actual implementation
    // always converts Blob to ArrayBuffer before returning, so we only need to handle ArrayBuffer
    if (downloadedData instanceof ArrayBuffer) {
      promptTemplate = new TextDecoder().decode(downloadedData);
    } else {
      // This should never happen given the return type, but included for defensive programming
      throw new Error("Invalid template file format");
    }
  } else {
    // Both prompt_text and document_template_id are missing or empty
    throw new Error(
      "System prompt template is missing both prompt_text and document_template_id",
    );
  }

  const sourceContributionId = job.target_contribution_id;

  const context = await gatherContext(
    dbClient,
    (bucket, path) => downloadFromStorage(dbClient, bucket, path),
    gatherInputsForStage,
    project,
    session,
    stage,
    projectInitialUserPrompt,
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
      attemptCount: job.attempt_count,
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
