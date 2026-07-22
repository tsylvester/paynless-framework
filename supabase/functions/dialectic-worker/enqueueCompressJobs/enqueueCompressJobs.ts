import { sanitizeForPath } from "../../_shared/utils/path_constructor.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
  isFileType,
  isModelContributionFileType,
} from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { isDialecticStageSlug } from "../enqueueRenderJob/enqueueRenderJob.guards.ts";
import type { TablesInsert } from "../../types_db.ts";
import {
  CompressJobEnqueueError,
  CompressJobValidationError,
  DialecticCompressJobPayload,
  enqueueCompressJobsDeps,
  enqueueCompressJobsFn,
  enqueueCompressJobsParams,
  enqueueCompressJobsReturn,
} from "./enqueueCompressJobs.interface.ts";
import { isenqueueCompressJobsPayload } from "./enqueueCompressJobs.guard.ts";

const TEMPLATE_OVERHEAD_TOKENS = 500;
const SAFETY_BUFFER_TOKENS = 32;

export const enqueueCompressJobs: enqueueCompressJobsFn = async (
  deps: enqueueCompressJobsDeps,
  params: enqueueCompressJobsParams,
  payload,
): Promise<enqueueCompressJobsReturn> => {
  if (!isenqueueCompressJobsPayload(payload)) {
    return {
      error: new CompressJobValidationError("Invalid enqueueCompressJobs payload."),
      retriable: false,
    };
  }

  const { victim } = payload;

  // 1. Validate victim content
  if (typeof victim.content !== "string" || victim.content === "") {
    return {
      error: new CompressJobValidationError("Victim content must be a non-empty string."),
      retriable: false,
    };
  }

  // 2. Explicit sourceType branch + identity determination
  let identity: string;

  if (victim.sourceType === "contribution" || victim.sourceType === "resource") {
    if (!isFileType(victim.documentKey)) {
      return {
        error: new CompressJobValidationError(
          `sourceType '${victim.sourceType}' requires a non-empty documentKey.`,
        ),
        retriable: false,
      };
    }
    identity = victim.documentKey;
  } else if (victim.sourceType === "feedback" || victim.sourceType === "history") {
    if (typeof victim.sourceId !== "string" || victim.sourceId === "") {
      return {
        error: new CompressJobValidationError(
          `sourceType '${victim.sourceType}' requires a non-empty sourceId.`,
        ),
        retriable: false,
      };
    }
    identity = victim.sourceId;
  } else {
    return {
      error: new CompressJobValidationError(
        `Unrecognized sourceType '${victim.sourceType}'.`,
      ),
      retriable: false,
    };
  }

  // 3. Explicit mode branch
  if (victim.mode === "json") {
    if (
      !isFileType(victim.documentKey) ||
      !isModelContributionFileType(victim.docType) ||
      !isDialecticStageSlug(victim.sourceStageSlug)
    ) {
      return {
        error: new CompressJobValidationError(
          "mode:'json' requires documentKey, docType, and sourceStageSlug.",
        ),
        retriable: false,
      };
    }
  } else if (victim.mode !== "text") {
    return {
      error: new CompressJobValidationError(
        `Unrecognized compression mode '${victim.mode}'.`,
      ),
      retriable: false,
    };
  }

  // 4. Dedup layer: canonical final-artifact existence check
  const pathContext = {
    fileType: FileType.CompressedContext,
    projectId: params.projectId,
    sessionId: params.sessionId,
    iteration: params.iterationNumber,
    stageSlug: params.stageSlug,
    targetKey: params.targetKey,
    sourceType: victim.sourceType,
    documentKey: victim.documentKey,
    sourceId: victim.sourceId,
  };

  let artifactPath: { storagePath: string; fileName: string };
  try {
    artifactPath = deps.constructStoragePath(pathContext);
  } catch (err) {
    let message: string;
    if (err instanceof Error) {
      message = err.message;
    } else {
      message = String(err);
    }
    return {
      error: new CompressJobValidationError(
        `Could not compute canonical artifact path: ${message}`,
      ),
      retriable: false,
    };
  }

  const { data: existingResource, error: existenceError } = await params.dbClient
    .from("dialectic_project_resources")
    .select("id")
    .eq("storage_path", artifactPath.storagePath)
    .eq("file_name", artifactPath.fileName)
    .maybeSingle();

  if (existenceError) {
    return {
      error: new CompressJobEnqueueError(
        `Existence check failed: ${existenceError.message}`,
      ),
      retriable: true,
    };
  }

  if (existingResource) {
    return { createdCount: 0 };
  }

  // 5. Size the victim
  const maxInputTokens = params.modelConfig.provider_max_input_tokens;
  if (typeof maxInputTokens !== "number" || Number.isNaN(maxInputTokens) || maxInputTokens <= 0) {
    return {
      error: new CompressJobValidationError(
        "modelConfig.provider_max_input_tokens must be a positive number.",
      ),
      retriable: false,
    };
  }

  const tokenBudget = maxInputTokens - TEMPLATE_OVERHEAD_TOKENS - SAFETY_BUFFER_TOKENS;
  if (tokenBudget <= 0) {
    return {
      error: new CompressJobValidationError(
        "Token budget after reserves is non-positive.",
      ),
      retriable: false,
    };
  }

  const tokenCount = deps.countTokens(
    params.tokenizerDeps,
    { message: victim.content },
    params.modelConfig,
  );
  if (typeof tokenCount !== "number" || Number.isNaN(tokenCount)) {
    return {
      error: new CompressJobEnqueueError("countTokens returned an invalid number."),
      retriable: false,
    };
  }

  // 6. Split if over budget
  let chunks: string[];
  let effectiveMode: "text" | "json";
  if (tokenCount <= tokenBudget) {
    chunks = [victim.content];
    effectiveMode = victim.mode;
  } else {
    const splitResult = await deps.textSplitter.splitText(victim.content);
    if (!Array.isArray(splitResult) || splitResult.length === 0) {
      return {
        error: new CompressJobValidationError(
          "textSplitter returned no chunks.",
        ),
        retriable: false,
      };
    }
    chunks = splitResult;
    effectiveMode = "text";
  }

  // 7. Build child payload(s) + idempotency keys
  const baseIdempotencyKey =
    `${params.parentJob.id}_compress_${victim.sourceType}_${identity}_${sanitizeForPath(params.targetKey)}`;

  const insertRows: TablesInsert<"dialectic_generation_jobs">[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const isChunked = chunks.length > 1;

    const childPayload: DialecticCompressJobPayload = {
      job_type: "COMPRESS",
      sessionId: params.sessionId,
      projectId: params.projectId,
      stageSlug: params.stageSlug,
      targetKey: params.targetKey,
      iterationNumber: params.iterationNumber,
      model_id: params.modelId,
      mode: effectiveMode,
      content: chunk,
      sourceType: victim.sourceType,
      walletId: params.walletId,
      user_id: params.parentJob.user_id,
    };

    if (victim.sourceId !== undefined) {
      childPayload.sourceId = victim.sourceId;
    }
    if (victim.documentKey !== undefined) {
      childPayload.documentKey = victim.documentKey;
    }
    if (victim.docType !== undefined) {
      childPayload.docType = victim.docType;
    }
    if (victim.sourceStageSlug !== undefined) {
      childPayload.sourceStageSlug = victim.sourceStageSlug;
    }

    let idempotencyKey = baseIdempotencyKey;

    if (isChunked) {
      childPayload.chunk_index = index + 1;
      childPayload.chunk_total = chunks.length;
      idempotencyKey = `${baseIdempotencyKey}_chunk_${childPayload.chunk_index}of${childPayload.chunk_total}`;
    }

    if (!isJson(childPayload)) {
      return {
        error: new CompressJobValidationError(
          "Constructed child payload is not valid Json.",
        ),
        retriable: false,
      };
    }

    insertRows.push({
      job_type: "COMPRESS",
      parent_job_id: params.parentJob.id,
      session_id: params.sessionId,
      stage_slug: params.stageSlug,
      iteration_number: params.iterationNumber,
      user_id: params.parentJob.user_id,
      is_test_job: params.parentJob.is_test_job,
      status: "pending",
      idempotency_key: idempotencyKey,
      payload: childPayload,
    });
  }

  // 8. Single batch insert
  const { error: insertError } = await params.dbClient
    .from("dialectic_generation_jobs")
    .insert(insertRows);

  if (insertError) {
    return {
      error: new CompressJobEnqueueError(
        `Insert failed: ${insertError.message}`,
      ),
      retriable: false,
    };
  }

  return { createdCount: insertRows.length };
}
