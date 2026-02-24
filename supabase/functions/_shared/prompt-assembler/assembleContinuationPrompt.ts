import {
  AssembledPrompt,
  AssembleContinuationPromptDeps,
} from "./prompt-assembler.interface.ts";
import { isRecord } from "../utils/type_guards.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import { FileType } from "../types/file_manager.types.ts";
import { HeaderContext } from "../../dialectic-service/dialectic.interface.ts";

export const MOCK_CONTINUATION_INSTRUCTION_EXPLICIT =
  "Please continue the following text, ensuring you complete the thought without repetition:";
export const MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON =
  "The previous response was an incomplete JSON object. Please complete the following JSON object, ensuring it is syntactically valid:";
export const MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON =
  "The previous response was a malformed JSON object. Please correct the following JSON object, ensuring it is syntactically valid:";

export async function assembleContinuationPrompt(
  {
    dbClient,
    fileManager,
    job,
    project,
    session,
    stage,
  }: AssembleContinuationPromptDeps,
): Promise<AssembledPrompt> {
  if (!session.selected_model_ids || session.selected_model_ids.length === 0) {
    throw new Error("PRECONDITION_FAILED: Session has no selected models.");
  }
  if (!isRecord(job.payload)) {
    throw new Error("PRECONDITION_FAILED: Job payload is missing.");
  }
  if (typeof job.payload.model_id !== "string") {
    throw new Error("PRECONDITION_FAILED: Job payload is missing 'model_id'.");
  }

  // 1. Fetch Model Details
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

  // 2. Fetch Header Context (if applicable)
  let headerContext: HeaderContext | null = null;
  const inputs = isRecord(job.payload.inputs) ? job.payload.inputs : null;
  const headerContextId = inputs?.header_context_id;

  if (typeof headerContextId === "string" && headerContextId.trim().length > 0) {
    // Query contribution by ID to get storage details
    const { data: headerContrib, error: contribError } = await dbClient
      .from("dialectic_contributions")
      .select("id, storage_bucket, storage_path, file_name, contribution_type")
      .eq("id", headerContextId)
      .single();

    if (contribError || !headerContrib) {
      throw new Error(
        `Header context contribution with id '${headerContextId}' not found in database: ${contribError?.message}`,
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

    // Construct storage path
    const fileName = headerContrib.file_name;
    const pathToDownload = headerContrib.storage_path + "/" + fileName;

    // Download using the contribution's bucket
    const { data: buffer, error } = await downloadFromStorage(
      dbClient,
      headerContrib.storage_bucket,
      pathToDownload,
    );

    if (error || !buffer) {
      throw new Error(
        `Failed to download header context file from storage: ${error?.message}`,
      );
    }

    try {
      const text = new TextDecoder().decode(buffer);
      headerContext = JSON.parse(text);
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`Failed to parse HeaderContext JSON: ${e.message}`);
      }
      throw new Error("Failed to parse HeaderContext JSON");
    }
  }

  const promptParts: string[] = [];

  if (headerContext?.system_materials) {
    promptParts.push(JSON.stringify(headerContext.system_materials, null, 2));
  }

  const targetContributionId = job.payload.target_contribution_id;
  if (typeof targetContributionId !== "string" || targetContributionId.length === 0) {
    throw new Error("PRECONDITION_FAILED: target_contribution_id is required");
  }

  // Query prior contribution
  const { data: priorContrib, error: priorContribError } = await dbClient
    .from("dialectic_contributions")
    .select("id, storage_bucket, storage_path, file_name")
    .eq("id", targetContributionId)
    .single();

  if (priorContribError || !priorContrib) {
    throw new Error(
      `Failed to resolve prior contribution ${targetContributionId}: ${priorContribError?.message}`,
    );
  }

  if (
    !priorContrib.storage_bucket || !priorContrib.storage_path ||
    !priorContrib.file_name
  ) {
    throw new Error(
      `Prior contribution ${targetContributionId} is missing storage metadata`,
    );
  }

  const priorPath = `${priorContrib.storage_path}/${priorContrib.file_name}`;
  const { data: priorBuffer, error: priorDownloadError } =
    await downloadFromStorage(
      dbClient,
      priorContrib.storage_bucket,
      priorPath,
    );

  if (priorDownloadError || !priorBuffer) {
    throw new Error(
      `Failed to download prior output file from storage: ${priorDownloadError?.message}`,
    );
  }

  const continuationContent = new TextDecoder().decode(priorBuffer);
  promptParts.push(continuationContent);

  const finalPrompt = promptParts.join("\n\n");

  const { payload } = job;


  const sourceContributionId = payload.target_contribution_id;

  let fileType: FileType;
  if (job.job_type === "PLAN") {
    fileType = FileType.PlannerPrompt;
  } else {
    fileType = FileType.TurnPrompt;
  }

if (typeof payload.model_slug !== "string") {
  throw new Error("PRECONDITION_FAILED: Job payload is missing 'model_slug'.");
}
if (typeof payload.document_key !== "string") {
  throw new Error("PRECONDITION_FAILED: Job payload is missing 'document_key'.");
}
if (typeof sourceContributionId !== "string") {
  throw new Error("PRECONDITION_FAILED: sourceContributionId is not a string.");
}

  const response = await fileManager.uploadAndRegisterFile({
    pathContext: {
      projectId: project.id,
      sessionId: session.id,
      iteration: session.iteration_count,
      stageSlug: stage.slug,
      fileType: fileType,
      modelSlug: payload.model_slug,
      attemptCount: job.attempt_count,
      documentKey: payload.document_key,
      stepName: stage.recipe_step?.step_name,
      isContinuation: true,
      turnIndex: (job.attempt_count || 0) + 1,
      branchKey: stage.recipe_step?.branch_key,
      parallelGroup: stage.recipe_step?.parallel_group,
      sourceContributionId,
    },
    fileContent: finalPrompt,
    mimeType: "text/markdown",
    sizeBytes: new TextEncoder().encode(finalPrompt).length,
    userId: project.user_id,
    description: `Continuation prompt for job ${job.id}`,
  });

  if (response.error) {
    throw new Error(
      `Failed to save continuation prompt: ${response.error.message}`,
    );
  }

  return {
    promptContent: finalPrompt,
    source_prompt_resource_id: response.record.id,
  };
}
