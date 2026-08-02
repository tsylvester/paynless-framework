import { isRecord } from "../../utils/type_guards.ts";
import { FileType } from "../../types/file_manager.types.ts";
import type { PathContext, ResourceUploadContext } from "../../types/file_manager.types.ts";
import { isDialecticStageSlug, isFileType } from "../../utils/type-guards/type_guards.file_manager.ts";
import { HeaderContext } from "../../../dialectic-service/dialectic.interface.ts";
import type { GatherContinuationInputsPayload } from "../gatherContinuationInputs/gatherContinuationInputs.interface.ts";
import type { AssembleContinuationPromptDeps, AssembledPrompt } from "../prompt-assembler.interface.ts";
import { isDialecticCompressJobPayload } from "../../../dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.provides.ts";
import type { Messages } from "../../types.ts";

export const MOCK_CONTINUATION_INSTRUCTION_EXPLICIT =
  "Please continue the following text, ensuring you complete the thought without repetition:";

export const MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON =
  "The previous response was an incomplete JSON object. Please complete the following JSON object, ensuring it is syntactically valid:";

export const MOCK_CONTINUATION_INSTRUCTION_MALFORMED_JSON =
  "The previous response was a malformed JSON object. Please correct the following JSON object, ensuring it is syntactically valid:";

/**
 * Continuation assembly keeps `gatherContinuationInputs` output as a structured `messages` array
 * so downstream workers can fill `conversationHistory` and `currentUserPrompt` without re-parsing a
 * flattened blob. `promptContent` remains the upload artifact: header context (if any) plus the third
 * message (continuation instruction) only, preserving existing storage and consumers that read only
 * `promptContent` / `source_prompt_resource_id`.
 */

export async function assembleContinuationPrompt(
  {
    dbClient,
    fileManager,
    job,
    project,
    session,
    stage,
    gatherContinuationInputs,
    assembleChunks,
    downloadFromStorage: downloadFromStorageFn,
    constructStoragePath,
  }: AssembleContinuationPromptDeps,

): Promise<AssembledPrompt> {
  if (!isRecord(job.payload)) {
    throw new Error("PRECONDITION_FAILED: Job payload is missing.");
  }

  if (typeof job.payload.model_id !== "string") {
    throw new Error("PRECONDITION_FAILED: Job payload is missing 'model_id'.");
  }

  const readArtifact = async (context: PathContext): Promise<string> => {
    const artifactPath = constructStoragePath(context);
    const { data: resource, error: resourceError } = await dbClient
      .from("dialectic_project_resources")
      .select("storage_bucket, storage_path, file_name")
      .eq("storage_path", artifactPath.storagePath)
      .eq("file_name", artifactPath.fileName)
      .single();

    if (resourceError || !resource) {
      throw new Error(
        `PRECONDITION_FAILED: ${context.fileType === FileType.CompressionPrompt ? "First-pass compression prompt" : "Prior compression output"} not found at ${artifactPath.storagePath}/${artifactPath.fileName}.`,
      );
    }

    const { data: buffer, error: downloadError } = await downloadFromStorageFn(
      resource.storage_bucket,
      `${resource.storage_path}/${resource.file_name}`,
    );

    if (downloadError || !buffer) {
      throw new Error(
        `PRECONDITION_FAILED: ${context.fileType === FileType.CompressionPrompt ? "First-pass compression prompt" : "Prior compression output"} not found at ${artifactPath.storagePath}/${artifactPath.fileName}.`,
      );
    }

    return new TextDecoder().decode(buffer);
  };

  let finalPrompt: string;
  let messages: Messages[];
  let uploadContext: ResourceUploadContext;

  if (isDialecticCompressJobPayload(job.payload)) {
    const promptContext: PathContext = {
      projectId: job.payload.projectId,
      sessionId: job.payload.sessionId,
      iteration: job.payload.iterationNumber,
      stageSlug: job.payload.stageSlug,
      fileType: FileType.CompressionPrompt,
      modelSlug: job.payload.model_slug,
      attemptCount: job.attempt_count,
      targetKey: job.payload.targetKey,
      sourceType: job.payload.sourceType,
      documentKey: job.payload.documentKey,
    };
    const responseContext: PathContext = {
      projectId: job.payload.projectId,
      sessionId: job.payload.sessionId,
      iteration: job.payload.iterationNumber,
      stageSlug: job.payload.stageSlug,
      fileType: FileType.CompressedContextRawJson,
      targetKey: job.payload.targetKey,
      sourceType: job.payload.sourceType,
      documentKey: job.payload.documentKey,
    };
    const firstPassPrompt: string = await readArtifact(promptContext);
    const partialResponse: string = await readArtifact(responseContext);
    messages = [
      { role: "user", content: firstPassPrompt },
      { role: "assistant", content: partialResponse },
      { role: "user", content: MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON },
    ];
    finalPrompt = [partialResponse, MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON].join("\n\n");
    uploadContext = {
      pathContext: {
        projectId: job.payload.projectId,
        sessionId: job.payload.sessionId,
        iteration: job.payload.iterationNumber,
        stageSlug: job.payload.stageSlug,
        fileType: FileType.CompressionPrompt,
        modelSlug: job.payload.model_slug,
        attemptCount: job.attempt_count,
        targetKey: job.payload.targetKey,
        sourceType: job.payload.sourceType,
        documentKey: job.payload.documentKey,
        isContinuation: true,
        turnIndex: (job.attempt_count || 0) + 1,
      },
      fileContent: finalPrompt,
      mimeType: "text/markdown",
      sizeBytes: new TextEncoder().encode(finalPrompt).length,
      userId: job.payload.user_id,
      description: `Continuation prompt for compression job ${job.id}`,
    };
  } else {
    if (!project) {
      throw new Error("PRECONDITION_FAILED: project is required for a contribution continuation.");
    }
    if (!session) {
      throw new Error("PRECONDITION_FAILED: session is required for a contribution continuation.");
    }
    if (!stage) {
      throw new Error("PRECONDITION_FAILED: stage is required for a contribution continuation.");
    }
    if (!assembleChunks) {
      throw new Error("PRECONDITION_FAILED: assembleChunks is required for a contribution continuation.");
    }
    if (!gatherContinuationInputs) {
      throw new Error("PRECONDITION_FAILED: gatherContinuationInputs is required for a contribution continuation.");
    }

    if (!session.selected_model_ids || session.selected_model_ids.length === 0) {
      throw new Error("PRECONDITION_FAILED: Session has no selected models.");
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
    const { data: buffer, error } = await downloadFromStorageFn(
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

    // Resolve root contribution by walking backwards via target_contribution_id
    let currentId: string = targetContributionId;
    for (;;) {
    const { data: row, error: rowError } = await dbClient
      .from("dialectic_contributions")
      .select("id, target_contribution_id")
      .eq("id", currentId)
      .single();

    if (rowError || !row) {
      throw new Error(
        `Failed to resolve prior contribution ${currentId}: ${rowError?.message}`,
      );
    }

    const nextId = row.target_contribution_id;
    if (nextId == null || typeof nextId !== "string" || nextId.trim().length === 0) {
      break;
    }
    currentId = nextId;
    }

    const rootContributionId: string = currentId;
    const gatherPayload: GatherContinuationInputsPayload = {};
    const gatherResult = await gatherContinuationInputs(
    {
      dbClient,
      assembleChunks,
      downloadFromStorageFn: downloadFromStorageFn,
    },
    { chunkId: rootContributionId },
    gatherPayload,
    );

    if (gatherResult.success === false) {
      throw new Error(gatherResult.error);
    }

    messages = gatherResult.messages;
    const thirdMessage = messages[2];
    if (thirdMessage === undefined) {
    throw new Error(
      "PRECONDITION_FAILED: gatherContinuationInputs returned fewer than three messages.",
    );
    }

    if (thirdMessage.role !== "user") {
    throw new Error(
      "PRECONDITION_FAILED: Third continuation message must have role user.",
    );
    }

    if (typeof thirdMessage.content !== "string") {
    throw new Error(
      "PRECONDITION_FAILED: Third continuation message content must be a string.",
    );
    }

    promptParts.push(thirdMessage.content);

    finalPrompt = promptParts.join("\n\n");
    const { payload } = job;
    const sourceContributionId = payload.target_contribution_id;

    if (typeof payload.model_slug !== "string") {
      throw new Error("PRECONDITION_FAILED: Job payload is missing 'model_slug'.");
    }

    if (!isFileType(payload.document_key)) {
      throw new Error("PRECONDITION_FAILED: Job payload is missing or has invalid 'document_key'.");
    }

    if (typeof sourceContributionId !== "string") {
      throw new Error("PRECONDITION_FAILED: sourceContributionId is not a string.");
    }

    if (!isDialecticStageSlug(stage.slug)) {
      throw new Error("PRECONDITION_FAILED: stage.slug is not a valid DialecticStageSlug.");
    }

    uploadContext = {
      pathContext: {
        projectId: project.id,
        sessionId: session.id,
        iteration: session.iteration_count,
        stageSlug: stage.slug,
        fileType: job.job_type === "PLAN" ? FileType.PlannerPrompt : FileType.TurnPrompt,
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
    };
  }

  const response = await fileManager.uploadAndRegisterFile(uploadContext);

  if (response.error) {
    throw new Error(
      `Failed to save continuation prompt: ${response.error}`,
    );

  }

  return {
    promptContent: finalPrompt,
    source_prompt_resource_id: response.record.id,
    messages,
  };
}
