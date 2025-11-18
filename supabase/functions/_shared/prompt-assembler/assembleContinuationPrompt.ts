import {
  AssembledPrompt,
  AssembleContinuationPromptDeps,
} from "./prompt-assembler.interface.ts";
import { isRecord } from "../utils/type_guards.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import { FileType } from "../types/file_manager.types.ts";

export const MOCK_CONTINUATION_INSTRUCTION_EXPLICIT =
  "Please continue the following text, ensuring you complete the thought without repetition:";
export const MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON =
  "The previous response was an incomplete JSON object. Please complete the following JSON object, ensuring it is syntactically valid:";
export const MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON =
  "The previous response was a malformed JSON object. Please correct the following JSON object, ensuring it is syntactically valid:";

type HeaderContext = {
  system_materials: Record<string, unknown>;
};

function getJsonCorrectiveInstruction(content: string): string | null {
  if (!content.trim().startsWith("{") && !content.trim().startsWith("[")) {
    return null;
  }
  try {
    JSON.parse(content);
    return null;
  } catch (e) {
    if (e instanceof SyntaxError) {
      // Any syntax error is treated as a signal to send a corrective prompt.
      // We don't need to differentiate between "incomplete" and other syntax errors.
      return MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON;
    }
    // Non-SyntaxError exceptions are also treated as malformed content.
    return MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON;
  }
}

export async function assembleContinuationPrompt(
  {
    dbClient,
    fileManager,
    job,
    project,
    session,
    stage,
    continuationContent,
  }: AssembleContinuationPromptDeps,
): Promise<AssembledPrompt> {
  if (!continuationContent) {
    throw new Error(
      "PRECONDITION_FAILED: continuationContent must be a non-empty string.",
    );
  }

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
  const headerResourceId = job.payload?.header_context_resource_id;

  if (typeof headerResourceId === "string") {
    const { data: buffer, error } = await downloadFromStorage(
      dbClient,
      "dialectic_project_resources",
      headerResourceId,
    );

    if (error || !buffer) {
      throw new Error(
        `Failed to fetch HeaderContext with ID ${headerResourceId}: ${error?.message}`,
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

  const correctiveInstruction = getJsonCorrectiveInstruction(continuationContent);
  const instruction = correctiveInstruction ??
    MOCK_CONTINUATION_INSTRUCTION_EXPLICIT;

  const promptParts: string[] = [];

  if (headerContext?.system_materials) {
    promptParts.push(JSON.stringify(headerContext.system_materials, null, 2));
  }

  promptParts.push(instruction);
  promptParts.push(continuationContent);

  const finalPrompt = promptParts.join("\n\n");

  const { payload } = job;
  const modelSlug = typeof payload.model_slug === "string"
    ? payload.model_slug
    : "unknown-model";

  let sourceContributionId: string | undefined;
  if (
    typeof payload.target_contribution_id === "string" &&
    payload.target_contribution_id.trim().length > 0
  ) {
    sourceContributionId = payload.target_contribution_id;
  }

  let fileType: FileType;
  if (job.job_type === "PLAN") {
    fileType = FileType.PlannerPrompt;
  } else {
    fileType = FileType.TurnPrompt;
  }

  const response = await fileManager.uploadAndRegisterFile({
    pathContext: {
      projectId: project.id,
      sessionId: session.id,
      iteration: session.iteration_count,
      stageSlug: stage.slug,
      fileType: fileType,
      modelSlug: modelSlug,
      attemptCount: job.attempt_count,
      documentKey: typeof payload.document_key === "string"
        ? payload.document_key
        : undefined,
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
