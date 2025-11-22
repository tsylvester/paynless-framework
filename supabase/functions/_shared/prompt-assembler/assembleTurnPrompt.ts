import {
  AssembledPrompt,
  AssembleTurnPromptDeps,
} from "./prompt-assembler.interface.ts";
import { isRecord } from "../utils/type_guards.ts";
import { FileManagerResponse, FileType } from "../types/file_manager.types.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import { renderPrompt } from "../prompt-renderer.ts";

// Helper type for the parsed header context content
type HeaderContext = {
  system_materials: Record<string, unknown>;
  files_to_generate: {
    document_key: string;
    template_filename: string;
  }[];
};

export async function assembleTurnPrompt(
  {
    dbClient,
    fileManager,
    job,
    project,
    session,
    stage,
  }: AssembleTurnPromptDeps,
): Promise<AssembledPrompt> {
  // 1. Precondition Guards
  if (!session.selected_model_ids || session.selected_model_ids.length === 0) {
    throw new Error(
      "PRECONDITION_FAILED: Session must have at least one selected model.",
    );
  }
  if (!isRecord(job.payload)) {
    throw new Error(
      "PRECONDITION_FAILED: Job payload is missing or not a valid record.",
    );
  }
  if (
    "step_info" in job.payload
  ) {
    throw new Error(
      "PRECONDITION_FAILED: Legacy 'step_info' object found in job payload.",
    );
  }
  if (!isRecord(job.payload.inputs)) {
    throw new Error(
      "PRECONDITION_FAILED: Job payload inputs is missing or not a valid record.",
    );
  }
  if (typeof job.payload.inputs.header_context_id !== "string") {
    throw new Error(
      "PRECONDITION_FAILED: Job payload inputs is missing 'header_context_id'.",
    );
  }
  if (typeof job.payload.document_key !== "string") {
    throw new Error("PRECONDITION_FAILED: Job payload is missing 'document_key'.");
  }
  if (typeof job.payload.model_id !== "string") {
    throw new Error("PRECONDITION_FAILED: Job payload is missing 'model_id'.");
  }
  if (!stage.recipe_step) {
    throw new Error("PRECONDITION_FAILED: Stage context is missing recipe_step.");
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

  // 3. Fetch Header Context Contribution from Database
  const headerContextId = job.payload.inputs.header_context_id;
  const { data: headerContrib, error: contribError } = await dbClient
    .from("dialectic_contributions")
    .select("id, storage_bucket, storage_path, file_name, contribution_type")
    .eq("id", headerContextId)
    .single();

  if (contribError || !headerContrib) {
    throw new Error(
      `Header context contribution with id '${headerContextId}' not found in database.`,
    );
  }

  if (headerContrib.contribution_type !== "header_context") {
    throw new Error(
      `Contribution '${headerContextId}' is not a header_context contribution (found '${headerContrib.contribution_type}').`,
    );
  }

  if (typeof headerContrib.storage_bucket !== "string" || !headerContrib.storage_bucket) {
    throw new Error(
      `Header context contribution '${headerContextId}' is missing required storage_bucket.`,
    );
  }

  if (typeof headerContrib.storage_path !== "string" || !headerContrib.storage_path) {
    throw new Error(
      `Header context contribution '${headerContextId}' is missing required storage_path.`,
    );
  }

  if (typeof headerContrib.file_name !== "string" || !headerContrib.file_name) {
    throw new Error(
      `Header context contribution '${headerContextId}' is missing required file_name.`,
    );
  }

  // 4. Construct Storage Path and Download Header Context
  const fileName = headerContrib.file_name || "";
  const pathToDownload = fileName
    ? `${headerContrib.storage_path}/${fileName}`
    : headerContrib.storage_path;

  const { data: headerBlob, error: headerError } = await downloadFromStorage(
    dbClient,
    headerContrib.storage_bucket,
    pathToDownload,
  );
  if (headerError || !headerBlob) {
    throw new Error(
      `Failed to download header context file from storage: ${headerError?.message}`,
    );
  }

  let headerContext: HeaderContext;
  try {
    let headerContent: string;
    if (headerBlob instanceof Blob) {
      headerContent = await headerBlob.text();
    } else if (headerBlob instanceof ArrayBuffer) {
      headerContent = new TextDecoder().decode(headerBlob);
    } else {
      throw new Error("Invalid format for header context file.");
    }
    headerContext = JSON.parse(headerContent);
  } catch (e: unknown) {
    let errorMessage = "An unknown error occurred while parsing JSON.";
    if (e instanceof Error) {
      errorMessage = e.message;
    }
    throw new Error(
      `Failed to parse header context content as JSON: ${errorMessage}`,
    );
  }

  // 5. Find and Fetch Document Template
  const documentKey = job.payload.document_key;
  const docInfo = headerContext.files_to_generate?.find(
    (f) => f.document_key === documentKey,
  );
  if (!docInfo) {
    throw new Error(
      `Document key '${documentKey}' from job payload not found in header context's files_to_generate.`,
    );
  }

  const contentStorageBucket = Deno.env.get("SB_CONTENT_STORAGE_BUCKET");
  if (!contentStorageBucket) {
    throw new Error(
      "SB_CONTENT_STORAGE_BUCKET environment variable is not set - fail loud and hard, no fallbacks",
    );
  }

  const { data: templateBlob, error: templateError } =
    await downloadFromStorage(
      dbClient,
      contentStorageBucket,
      docInfo.template_filename,
    );
  if (templateError || !templateBlob) {
    throw new Error(
      `Failed to download document template file ${docInfo.template_filename} from storage: ${templateError?.message}`,
    );
  }

  let documentTemplateContent: string;
  if (templateBlob instanceof Blob) {
    documentTemplateContent = await templateBlob.text();
  } else if (templateBlob instanceof ArrayBuffer) {
    documentTemplateContent = new TextDecoder().decode(templateBlob);
  } else {
    throw new Error("Invalid format for document template file.");
  }

  // 6. Render the Prompt
  const documentSpecificData = isRecord(job.payload.document_specific_data)
    ? job.payload.document_specific_data
    : {};
  const renderContext = {
    ...headerContext.system_materials,
    ...(isRecord(project.user_domain_overlay_values)
      ? project.user_domain_overlay_values
      : {}),
    ...documentSpecificData,
  };

  const renderedPrompt = renderPrompt(documentTemplateContent, renderContext);

  if (typeof job.payload.model_slug !== "string") {
    throw new Error("PRECONDITION_FAILED: Job payload is missing 'model_slug'.");
  }
  // 7. Persist the Assembled Prompt
  let sourceContributionId: string | undefined;
  if ("target_contribution_id" in job.payload) {
    const rawTargetContributionId = job.payload.target_contribution_id;
    if (
      rawTargetContributionId !== undefined &&
      rawTargetContributionId !== null &&
      typeof rawTargetContributionId !== "string"
    ) {
      throw new Error(
        "PRECONDITION_FAILED: Job payload target_contribution_id must be a string.",
      );
    }
    if (typeof rawTargetContributionId === "string") {
      sourceContributionId = rawTargetContributionId;
    }
  }

  const response: FileManagerResponse = await fileManager.uploadAndRegisterFile({
    pathContext: {
      projectId: project.id,
      sessionId: session.id,
      iteration: session.iteration_count,
      stageSlug: stage.slug,
      fileType: FileType.TurnPrompt,
      modelSlug: job.payload.model_slug,
      attemptCount: job.attempt_count,
      documentKey: documentKey,
      stepName: stage.recipe_step.step_name,
      branchKey: stage.recipe_step.branch_key,
      parallelGroup: stage.recipe_step.parallel_group,
      sourceContributionId,
    },
    fileContent: renderedPrompt,
    mimeType: "text/markdown",
    sizeBytes: new TextEncoder().encode(renderedPrompt).length,
    userId: project.user_id,
    description:
      `Turn prompt for stage: ${stage.slug}, document: ${documentKey}`,
  });

  if (response.error) {
    throw new Error(
      `Failed to save turn prompt: ${response.error.message}`,
    );
  }

  // 8. Return the Final AssembledPrompt
  return {
    promptContent: renderedPrompt,
    source_prompt_resource_id: response.record.id,
  };
}

