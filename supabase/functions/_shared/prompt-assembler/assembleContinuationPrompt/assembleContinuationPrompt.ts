import { isRecord } from "../../utils/type_guards.ts";
import { isDialecticExecuteJobPayload, isDialecticPlanJobPayload } from "../../utils/type_guards.ts";
import { FileType } from "../../types/file_manager.types.ts";
import type { PathContext, ResourceUploadContext } from "../../types/file_manager.types.ts";
import { isDialecticStageSlug, isFileType } from "../../utils/type-guards/type_guards.file_manager.ts";
import { HeaderContext } from "../../../dialectic-service/dialectic.interface.ts";
import type { GatherContinuationInputsPayload } from "../gatherContinuationInputs/gatherContinuationInputs.interface.ts";
import type {
  AssembleContinuationPromptDeps,
  AssembleContinuationPromptReturn,
  AssembledPrompt,
  ReadArtifactReturn,
} from "../prompt-assembler.interface.ts";
import { isAssembleContinuationPromptErrorReturn } from "../prompt-assembler.guard.ts";
import {
  isDialecticCompressJobPayload,
} from "../../../dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.provides.ts";
import type { DialecticCompressJobPayload } from "../../../dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.provides.ts";
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

): Promise<AssembleContinuationPromptReturn> {
  if (!isRecord(job.payload)) {
    return { error: new Error("PRECONDITION_FAILED: Job payload is missing."), retriable: false };
  }

  if (typeof job.payload.model_id !== "string") {
    return { error: new Error("PRECONDITION_FAILED: Job payload is missing 'model_id'."), retriable: false };
  }

  const readArtifact = async (context: PathContext): Promise<ReadArtifactReturn> => {
    const artifactPath = constructStoragePath(context);
    const { data: resource, error: resourceError } = await dbClient
      .from("dialectic_project_resources")
      .select("storage_bucket, storage_path, file_name")
      .eq("storage_path", artifactPath.storagePath)
      .eq("file_name", artifactPath.fileName)
      .single();

    if (resourceError || !resource) {
      return {
        error: new Error(
          `PRECONDITION_FAILED: ${context.fileType === FileType.CompressionPrompt ? "First-pass compression prompt" : "Prior compression output"} not found at ${artifactPath.storagePath}/${artifactPath.fileName}.`,
        ),
        retriable: true,
      };
    }

    const { data: buffer, error: downloadError } = await downloadFromStorageFn(
      resource.storage_bucket,
      `${resource.storage_path}/${resource.file_name}`,
    );

    if (downloadError || !buffer) {
      return {
        error: new Error(
          `PRECONDITION_FAILED: ${context.fileType === FileType.CompressionPrompt ? "First-pass compression prompt" : "Prior compression output"} not found at ${artifactPath.storagePath}/${artifactPath.fileName}.`,
        ),
        retriable: true,
      };
    }

    return { content: new TextDecoder().decode(buffer) };
  };

  let finalPrompt: string;
  let messages: Messages[];
  let uploadContext: ResourceUploadContext;

  if (job.job_type === 'COMPRESS') {
    let compressPayload: DialecticCompressJobPayload;
    try {
      if (!isDialecticCompressJobPayload(job.payload)) {
        return { error: new Error("PRECONDITION_FAILED: Job payload is not a valid compress job payload."), retriable: false };
      }
      compressPayload = job.payload;
    } catch (e) {
      if (e instanceof Error) {
        return { error: e, retriable: false };
      }
      throw e;
    }
    const promptContext: PathContext = {
      projectId: compressPayload.projectId,
      sessionId: compressPayload.sessionId,
      iteration: compressPayload.iterationNumber,
      stageSlug: compressPayload.stageSlug,
      fileType: FileType.CompressionPrompt,
      modelSlug: compressPayload.model_slug,
      attemptCount: job.attempt_count,
      targetKey: compressPayload.targetKey,
      sourceType: compressPayload.sourceType,
      documentKey: compressPayload.documentKey,
    };
    const responseContext: PathContext = {
      projectId: compressPayload.projectId,
      sessionId: compressPayload.sessionId,
      iteration: compressPayload.iterationNumber,
      stageSlug: compressPayload.stageSlug,
      fileType: FileType.CompressedContextRawJson,
      targetKey: compressPayload.targetKey,
      sourceType: compressPayload.sourceType,
      documentKey: compressPayload.documentKey,
    };
    const firstPassResult = await readArtifact(promptContext);
    if (isAssembleContinuationPromptErrorReturn(firstPassResult)) return firstPassResult;
    const partialResponseResult = await readArtifact(responseContext);
    if (isAssembleContinuationPromptErrorReturn(partialResponseResult)) return partialResponseResult;
    messages = [
      { role: "user", content: firstPassResult.content },
      { role: "assistant", content: partialResponseResult.content },
      { role: "user", content: MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON },
    ];
    finalPrompt = [partialResponseResult.content, MOCK_CONTINUATION_INSTRUCTION_INCOMPLETE_JSON].join("\n\n");
    uploadContext = {
      pathContext: {
        projectId: compressPayload.projectId,
        sessionId: compressPayload.sessionId,
        iteration: compressPayload.iterationNumber,
        stageSlug: compressPayload.stageSlug,
        fileType: FileType.CompressionPrompt,
        modelSlug: compressPayload.model_slug,
        attemptCount: job.attempt_count,
        targetKey: compressPayload.targetKey,
        sourceType: compressPayload.sourceType,
        documentKey: compressPayload.documentKey,
        isContinuation: true,
        turnIndex: (job.attempt_count || 0) + 1,
      },
      fileContent: finalPrompt,
      mimeType: "text/markdown",
      sizeBytes: new TextEncoder().encode(finalPrompt).length,
      userId: job.user_id,
      description: `Continuation prompt for compression job ${job.id}`,
    };
  } else {
    try {
      if (job.job_type === 'PLAN') {
        if (!isDialecticPlanJobPayload(job.payload)) {
          return { error: new Error("PRECONDITION_FAILED: Job payload is not a valid plan job payload."), retriable: false };
        }
      } else {
        if (!isDialecticExecuteJobPayload(job.payload)) {
          return { error: new Error("PRECONDITION_FAILED: Job payload is not a valid execute job payload."), retriable: false };
        }
      }
    } catch (e) {
      if (e instanceof Error) {
        return { error: e, retriable: false };
      }
      throw e;
    }
    if (!project) {
      return { error: new Error("PRECONDITION_FAILED: project is required for a contribution continuation."), retriable: false };
    }
    if (!session) {
      return { error: new Error("PRECONDITION_FAILED: session is required for a contribution continuation."), retriable: false };
    }
    if (!stage) {
      return { error: new Error("PRECONDITION_FAILED: stage is required for a contribution continuation."), retriable: false };
    }
    if (!assembleChunks) {
      return { error: new Error("PRECONDITION_FAILED: assembleChunks is required for a contribution continuation."), retriable: false };
    }
    if (!gatherContinuationInputs) {
      return { error: new Error("PRECONDITION_FAILED: gatherContinuationInputs is required for a contribution continuation."), retriable: false };
    }

    if (!session.selected_model_ids || session.selected_model_ids.length === 0) {
      return { error: new Error("PRECONDITION_FAILED: Session has no selected models."), retriable: false };
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
      return {
        error: new Error(
          `Header context contribution with id '${headerContextId}' not found in database: ${contribError?.message}`,
        ),
        retriable: true,
      };
    }

    if (headerContrib.contribution_type !== "header_context") {
      return {
        error: new Error(
          `Contribution '${headerContextId}' is not a header_context contribution (found '${headerContrib.contribution_type}').`,
        ),
        retriable: false,
      };
    }

    if (typeof headerContrib.storage_bucket !== "string" || !headerContrib.storage_bucket) {
      return {
        error: new Error(
          `Header context contribution '${headerContextId}' is missing required storage_bucket.`,
        ),
        retriable: false,
      };
    }

    if (typeof headerContrib.storage_path !== "string" || !headerContrib.storage_path) {
      return {
        error: new Error(
          `Header context contribution '${headerContextId}' is missing required storage_path.`,
        ),
        retriable: false,
      };
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
      return {
        error: new Error(
          `Failed to download header context file from storage: ${error?.message}`,
        ),
        retriable: true,
      };
    }

    try {
      const text = new TextDecoder().decode(buffer);
      headerContext = JSON.parse(text);
    } catch (e) {
      if (e instanceof Error) {
        return { error: new Error(`Failed to parse HeaderContext JSON: ${e.message}`), retriable: false };
      }
      throw e;
    }
    }

    const promptParts: string[] = [];

    if (headerContext?.system_materials) {
      promptParts.push(JSON.stringify(headerContext.system_materials, null, 2));
    }

    const targetContributionId = job.payload.target_contribution_id;
    if (typeof targetContributionId !== "string" || targetContributionId.length === 0) {
      return { error: new Error("PRECONDITION_FAILED: target_contribution_id is required"), retriable: false };
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
      return {
        error: new Error(
          `Failed to resolve prior contribution ${currentId}: ${rowError?.message}`,
        ),
        retriable: true,
      };
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
      return { error: new Error(gatherResult.error), retriable: false };
    }

    messages = gatherResult.messages;
    const thirdMessage = messages[2];
    if (thirdMessage === undefined) {
    return {
      error: new Error(
        "PRECONDITION_FAILED: gatherContinuationInputs returned fewer than three messages.",
      ),
      retriable: false,
    };
    }

    if (thirdMessage.role !== "user") {
    return {
      error: new Error(
        "PRECONDITION_FAILED: Third continuation message must have role user.",
      ),
      retriable: false,
    };
    }

    if (typeof thirdMessage.content !== "string") {
    return {
      error: new Error(
        "PRECONDITION_FAILED: Third continuation message content must be a string.",
      ),
      retriable: false,
    };
    }

    promptParts.push(thirdMessage.content);

    finalPrompt = promptParts.join("\n\n");
    const { payload } = job;
    const sourceContributionId = payload.target_contribution_id;

    if (typeof payload.model_slug !== "string") {
      return { error: new Error("PRECONDITION_FAILED: Job payload is missing 'model_slug'."), retriable: false };
    }

    if (typeof sourceContributionId !== "string") {
      return { error: new Error("PRECONDITION_FAILED: sourceContributionId is not a string."), retriable: false };
    }

    if (!isDialecticStageSlug(stage.slug)) {
      return { error: new Error("PRECONDITION_FAILED: stage.slug is not a valid DialecticStageSlug."), retriable: false };
    }

    if (job.job_type === "PLAN") {
      uploadContext = {
        pathContext: {
          projectId: project.id,
          sessionId: session.id,
          iteration: session.iteration_count,
          stageSlug: stage.slug,
          fileType: FileType.PlannerPrompt,
          modelSlug: payload.model_slug,
          attemptCount: job.attempt_count,
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
    } else {
      if (!isFileType(payload.document_key)) {
        return { error: new Error("PRECONDITION_FAILED: Job payload is missing or has invalid 'document_key'."), retriable: false };
      }
      uploadContext = {
        pathContext: {
          projectId: project.id,
          sessionId: session.id,
          iteration: session.iteration_count,
          stageSlug: stage.slug,
          fileType: FileType.TurnPrompt,
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
  }

  const response = await fileManager.uploadAndRegisterFile(uploadContext);

  if (response.error) {
    return {
      error: new Error(
        `Failed to save continuation prompt: ${response.error}`,
      ),
      retriable: true,
    };

  }

  const assembledPrompt: AssembledPrompt = {
    promptContent: finalPrompt,
    source_prompt_resource_id: response.record.id,
    messages,
  };
  return assembledPrompt;
}
