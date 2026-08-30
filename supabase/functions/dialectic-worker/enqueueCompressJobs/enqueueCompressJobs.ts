import { countTokens as countTokensAnthropic } from "npm:@anthropic-ai/tokenizer@0.0.4";
import { getEncoding as rawGetEncoding } from "npm:js-tiktoken@1.0.7";
import { sanitizeForPath } from "../../_shared/utils/path_constructor.ts";
import { FileType, type PathContext } from "../../_shared/types/file_manager.types.ts";
import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
  isCompressionHistoryRole,
  isFileType,
  isModelContributionFileType,
} from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { isDialecticStageSlug } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { isKnownTiktokenEncoding } from "../../_shared/utils/type-guards/type_guards.chat.ts";
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
import { isDialecticCompressJobPayload, isenqueueCompressJobsPayload } from "./enqueueCompressJobs.guard.ts";

const TEMPLATE_OVERHEAD_TOKENS = 500;
const SAFETY_BUFFER_TOKENS = 32;

const tokenizerDeps = {
  getEncoding: (name: string) => {
    if (!isKnownTiktokenEncoding(name)) {
      throw new Error(`Unsupported tiktoken encoding: ${name}`);
    }
    return rawGetEncoding(name);
  },
  countTokensAnthropic,
};

export const enqueueCompressJobs: enqueueCompressJobsFn = async (
  deps: enqueueCompressJobsDeps,
  params: enqueueCompressJobsParams,
  payload,
): Promise<enqueueCompressJobsReturn> => {
  if (!isenqueueCompressJobsPayload(payload)) {
    return {
      error: new CompressJobValidationError({ message: "Invalid enqueueCompressJobs payload." }),
      retriable: false,
    };
  }

  const { victim, parentJob, modelConfig } = payload;

  // Narrow parentJob.payload (Json) to DialecticCompressJobPayload via the
  // existing guard. The guard throws on invalid shape; convert to a
  // validation error return for the function's contract.
  let parentJobPayload: DialecticCompressJobPayload;
  try {
    if (!isDialecticCompressJobPayload(parentJob.payload)) {
      return {
        error: new CompressJobValidationError({ message: "parentJob.payload is not a valid DialecticCompressJobPayload." }),
        retriable: false,
      };
    }
    parentJobPayload = parentJob.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      error: new CompressJobValidationError({ message: `parentJob.payload is not a valid DialecticCompressJobPayload: ${message}` }),
      retriable: false,
    };
  }

  // 1. Validate victim content
  if (typeof victim.content !== "string" || victim.content === "") {
    return {
      error: new CompressJobValidationError({ message: "Victim content must be a non-empty string." }),
      retriable: false,
    };
  }

  // 2. Explicit sourceType branch + identity determination
  let identity: string;

  if (victim.sourceType === "contribution" || victim.sourceType === "resource" || victim.sourceType === "feedback") {
    if (!isFileType(victim.documentKey)) {
      return {
        error: new CompressJobValidationError({
          message: `sourceType '${victim.sourceType}' requires a non-empty documentKey.`,
        }),
        retriable: false,
      };
    }
    identity = victim.documentKey;
  } else if (victim.sourceType === "history") {
    if (typeof victim.sourceId !== "string" || victim.sourceId === "") {
      return {
        error: new CompressJobValidationError({
          message: `sourceType '${victim.sourceType}' requires a non-empty sourceId.`,
        }),
        retriable: false,
      };
    }
    if (!isCompressionHistoryRole(victim.role)) {
      return {
        error: new CompressJobValidationError({ message: "sourceType 'history' requires a role." }),
        retriable: false,
      };
    }
    identity = victim.sourceId;
  } else {
    return {
      error: new CompressJobValidationError({
        message: `Unrecognized sourceType '${victim.sourceType}'.`,
      }),
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
        error: new CompressJobValidationError({
          message: "mode:'json' requires documentKey, docType, and sourceStageSlug.",
        }),
        retriable: false,
      };
    }
  } else if (victim.mode !== "text") {
    return {
      error: new CompressJobValidationError({
        message: `Unrecognized compression mode '${victim.mode}'.`,
      }),
      retriable: false,
    };
  }

  // 4. Dedup layer: canonical final-artifact existence check
  const pathContext: PathContext = {
    fileType: FileType.CompressedContext,
    projectId: parentJobPayload.projectId,
    sessionId: parentJobPayload.sessionId,
    iteration: parentJobPayload.iterationNumber,
    stageSlug: parentJobPayload.stageSlug,
    output_type: parentJobPayload.output_type,
    sourceType: victim.sourceType,
    documentKey: victim.documentKey,
    sourceId: victim.sourceId,
    role: victim.role,
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
      error: new CompressJobValidationError({
        message: `Could not compute canonical artifact path: ${message}`,
      }),
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
      error: new CompressJobEnqueueError({
        message: `Existence check failed: ${existenceError.message}`,
      }),
      retriable: true,
    };
  }

  if (existingResource) {
    return { createdCount: 0 };
  }

  // 5. Size the victim
  const maxInputTokens = modelConfig.provider_max_input_tokens;
  if (typeof maxInputTokens !== "number" || Number.isNaN(maxInputTokens) || maxInputTokens <= 0) {
    return {
      error: new CompressJobValidationError({
        message: "modelConfig.provider_max_input_tokens must be a positive number.",
      }),
      retriable: false,
    };
  }

  const tokenBudget = maxInputTokens - TEMPLATE_OVERHEAD_TOKENS - SAFETY_BUFFER_TOKENS;
  if (tokenBudget <= 0) {
    return {
      error: new CompressJobValidationError({
        message: "Token budget after reserves is non-positive.",
      }),
      retriable: false,
    };
  }

  const tokenCount = deps.countTokens(
    { ...tokenizerDeps, logger: deps.logger },
    { message: victim.content },
    modelConfig,
  );
  if (typeof tokenCount !== "number" || Number.isNaN(tokenCount)) {
    return {
      error: new CompressJobEnqueueError({ message: "countTokens returned an invalid number." }),
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
        error: new CompressJobValidationError({
          message: "textSplitter returned no chunks.",
        }),
        retriable: false,
      };
    }
    chunks = splitResult;
    effectiveMode = "text";
  }

  // 7. Build child payload(s) + idempotency keys
  const baseIdempotencyKey =
    `${parentJob.id}_compress_${victim.sourceType}_${identity}_${sanitizeForPath(parentJobPayload.output_type)}`;

  const insertRows: TablesInsert<"dialectic_generation_jobs">[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const isChunked = chunks.length > 1;

    const childPayload: DialecticCompressJobPayload = {
      sessionId: parentJobPayload.sessionId,
      projectId: parentJobPayload.projectId,
      stageSlug: parentJobPayload.stageSlug,
      output_type: parentJobPayload.output_type,
      iterationNumber: parentJobPayload.iterationNumber,
      model_id: parentJobPayload.model_id,
      model_slug: parentJobPayload.model_slug,
      mode: effectiveMode,
      content: chunk,
      sourceType: victim.sourceType,
      walletId: parentJobPayload.walletId,
      user_jwt: parentJobPayload.user_jwt,
      idempotencyKey: baseIdempotencyKey,
    };

    if (victim.sourceId !== undefined) {
      childPayload.sourceId = victim.sourceId;
    }
    if (victim.role !== undefined) {
      childPayload.role = victim.role;
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

    if (isChunked) {
      childPayload.chunk_index = index + 1;
      childPayload.chunk_total = chunks.length;
      childPayload.idempotencyKey = `${baseIdempotencyKey}_chunk_${childPayload.chunk_index}of${childPayload.chunk_total}`;
    }

    if (!isJson(childPayload)) {
      return {
        error: new CompressJobValidationError({
          message: "Constructed child payload is not valid Json.",
        }),
        retriable: false,
      };
    }

    insertRows.push({
      job_type: "COMPRESS",
      parent_job_id: parentJob.id,
      session_id: parentJob.session_id,
      stage_slug: parentJob.stage_slug,
      iteration_number: parentJob.iteration_number,
      user_id: parentJob.user_id,
      is_test_job: parentJob.is_test_job,
      status: "pending",
      idempotency_key: childPayload.idempotencyKey,
      payload: childPayload,
    });
  }

  // 8. Single batch insert
  const { error: insertError } = await params.dbClient
    .from("dialectic_generation_jobs")
    .insert(insertRows);

  if (insertError) {
    return {
      error: new CompressJobEnqueueError({
        message: `Insert failed: ${insertError.message}`,
      }),
      retriable: false,
    };
  }

  return { createdCount: insertRows.length };
}
