// supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.ts

import type { DialecticRenderJobPayload } from "../../dialectic-service/dialectic.interface.ts";
import type { FileType } from "../../_shared/types/file_manager.types.ts";
import { RenderJobEnqueueError, RenderJobValidationError } from "../../_shared/utils/errors.ts";
import { isJson, isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isDialecticRenderJobPayload } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isFileType } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import type { TablesInsert } from "../../types_db.ts";
import type {
  EnqueueRenderJobDeps,
  EnqueueRenderJobParams,
  EnqueueRenderJobPayload,
  EnqueueRenderJobReturn,
} from "./enqueueRenderJob.interface.ts";

const RENDER_DECISION_QUERY_FAILURE_REASONS: readonly string[] = [
  "stage_not_found",
  "instance_not_found",
  "steps_not_found",
  "parse_error",
  "query_error",
  "no_active_recipe",
];

export async function enqueueRenderJob(
  deps: EnqueueRenderJobDeps,
  params: EnqueueRenderJobParams,
  payload: EnqueueRenderJobPayload,
): Promise<EnqueueRenderJobReturn> {
  const { dbClient, logger, shouldEnqueueRenderJob, resolveTemplateFilename } = deps;
  const {
    jobId,
    sessionId,
    stageSlug,
    iterationNumber,
    outputType,
    projectId,
    projectOwnerUserId,
    userAuthToken,
    modelId,
    walletId,
    isTestJob,
  } = params;

  if (payload.needsContinuation) {
    return { renderJobId: null };
  }

  const renderDecision = await shouldEnqueueRenderJob(
    { dbClient, logger },
    { outputType, stageSlug },
  );

  if (
    !renderDecision.shouldRender &&
    RENDER_DECISION_QUERY_FAILURE_REASONS.includes(renderDecision.reason)
  ) {
    logger.error(
      "[enqueueRenderJob] Failed to determine if RENDER job required due to query/config error",
      {
        reason: renderDecision.reason,
        details: renderDecision.details,
        outputType,
        stageSlug,
      },
    );
    const message: string =
      `Cannot determine render requirement: ${renderDecision.reason}${
        renderDecision.details ? ` - ${renderDecision.details}` : ""
      }`;
    const err: RenderJobEnqueueError = new RenderJobEnqueueError(message);
    return { error: err, retriable: false };
  }

  if (!renderDecision.shouldRender && renderDecision.reason === "is_json") {
    logger.info("[enqueueRenderJob] Skipping RENDER job for JSON output", {
      outputType,
    });
    return { renderJobId: null };
  }

  if (!(renderDecision.shouldRender && renderDecision.reason === "is_markdown")) {
    return { renderJobId: null };
  }

  logger.info("[enqueueRenderJob] Preparing to enqueue RENDER job", {
    jobId,
    outputType,
    fileType: payload.fileType,
    storageFileType: payload.storageFileType,
    documentKey: payload.documentKey,
  });

  const documentIdentityValue: string | undefined = payload.stageRelationshipForStage;
  if (typeof documentIdentityValue !== "string" || documentIdentityValue.trim() === "") {
    logger.error("[enqueueRenderJob] Cannot enqueue RENDER job: documentIdentity is missing or invalid", {
      jobId,
      documentIdentity: documentIdentityValue,
    });
    const validationErr: RenderJobValidationError = new RenderJobValidationError(
      `document_relationships[${stageSlug}] is required and must be a non-empty string before RENDER job creation. Contribution ID: ${payload.contributionId}`,
    );
    return { error: validationErr, retriable: false };
  }
  const documentIdentityStrict: string = documentIdentityValue;

  const documentKeyRaw: FileType | undefined = payload.documentKey;
  if (!documentKeyRaw || typeof documentKeyRaw !== "string" || documentKeyRaw.trim() === "") {
    logger.error("[enqueueRenderJob] Cannot enqueue RENDER job: documentKey is missing or invalid", {
      jobId,
      fileType: payload.fileType,
      documentKey: documentKeyRaw,
    });
    const validationErr: RenderJobValidationError = new RenderJobValidationError(
      "documentKey is required for RENDER job but is missing or invalid",
    );
    return { error: validationErr, retriable: false };
  }
  if (!isFileType(documentKeyRaw)) {
    const validationErr: RenderJobValidationError = new RenderJobValidationError(
      "documentKey is not a valid FileType",
    );
    return { error: validationErr, retriable: false };
  }
  const documentKeyAsFileType: FileType = documentKeyRaw;

  if (!payload.contributionId || typeof payload.contributionId !== "string" || payload.contributionId.trim() === "") {
    const validationErr: RenderJobValidationError = new RenderJobValidationError(
      "contribution.id is required for RENDER job but is missing or invalid",
    );
    return { error: validationErr, retriable: false };
  }
  const sourceContributionIdStrict: string = payload.contributionId;

  const templateResult = await resolveTemplateFilename(
    { dbClient },
    { stageSlug, outputType, documentKey: documentKeyAsFileType },
  );

  if ("error" in templateResult) {
    return templateResult;
  }

  const { templateFilename } = templateResult;

  const renderPayload: DialecticRenderJobPayload = {
    idempotencyKey: `${jobId}_render`,
    projectId,
    sessionId,
    iterationNumber,
    stageSlug,
    documentIdentity: documentIdentityStrict,
    documentKey: documentKeyAsFileType,
    sourceContributionId: sourceContributionIdStrict,
    template_filename: templateFilename,
    user_jwt: userAuthToken,
    model_id: modelId,
    walletId,
  };

  if (!isDialecticRenderJobPayload(renderPayload)) {
    const validationErr: RenderJobValidationError = new RenderJobValidationError(
      "renderPayload is not a valid DialecticRenderJobPayload",
    );
    return { error: validationErr, retriable: false };
  }

  if (!isJson(renderPayload)) {
    const validationErr: RenderJobValidationError = new RenderJobValidationError(
      "renderPayload is not a valid JSON object",
    );
    return { error: validationErr, retriable: false };
  }

  const insertObj: TablesInsert<"dialectic_generation_jobs"> = {
    job_type: "RENDER",
    session_id: sessionId,
    stage_slug: stageSlug,
    iteration_number: iterationNumber,
    parent_job_id: jobId,
    payload: renderPayload,
    is_test_job: isTestJob,
    status: "pending",
    user_id: projectOwnerUserId,
    idempotency_key: `${jobId}_render`,
  };

  const { data: renderInsertData, error: renderInsertError } = await dbClient
    .from("dialectic_generation_jobs")
    .insert(insertObj)
    .select("*")
    .single();

  if (renderInsertError) {
    const errorMessage: string = renderInsertError.message || "";
    const errorCode: string = renderInsertError.code || "";

    if (errorCode === "23505" && errorMessage.includes("idempotency_key")) {
      const renderIdempotencyKey: string = `${jobId}_render`;
      const { data: existingRow, error: selectError } = await dbClient
        .from("dialectic_generation_jobs")
        .select("*")
        .eq("idempotency_key", renderIdempotencyKey)
        .single();

      if (!selectError && existingRow && isRecord(existingRow) && typeof existingRow["id"] === "string") {
        const recoveredId: string = existingRow["id"];
        logger.info("[enqueueRenderJob] RENDER job already existed from prior attempt", {
          parent_job_id: jobId,
          render_job_id: recoveredId,
        });
        return { renderJobId: recoveredId };
      }

      logger.error("[enqueueRenderJob] Programmer error during RENDER job insert (23505 recovery failed)", {
        renderInsertError,
        insertObj,
        selectError,
      });
      const err: RenderJobEnqueueError = new RenderJobEnqueueError(
        `Failed to insert RENDER job due to database constraint violation: ${errorMessage} (code: ${errorCode})`,
      );
      return { error: err, retriable: false };
    }

    const isProgrammerError: boolean =
      errorMessage.includes("foreign key constraint") ||
      errorMessage.includes("unique constraint") ||
      errorMessage.includes("violates") ||
      errorCode === "42501" ||
      errorCode === "23503" ||
      errorCode === "23505";

    if (isProgrammerError) {
      logger.error("[enqueueRenderJob] Programmer error during RENDER job insert", {
        renderInsertError,
        insertObj,
        errorMessage,
        errorCode,
      });
      const err: RenderJobEnqueueError = new RenderJobEnqueueError(
        `Failed to insert RENDER job due to database constraint violation: ${errorMessage} (code: ${errorCode})`,
      );
      return { error: err, retriable: false };
    }

    logger.error("[enqueueRenderJob] Transient error during RENDER job insert - will retry", {
      renderInsertError,
      insertObj,
    });
    const transientErr: RenderJobEnqueueError = new RenderJobEnqueueError(
      `Failed to insert RENDER job due to transient error: ${errorMessage}`,
    );
    return { error: transientErr, retriable: true };
  }

  if (!isRecord(renderInsertData) || typeof renderInsertData["id"] !== "string") {
    logger.error("[enqueueRenderJob] RENDER insert succeeded but returned no row id", {
      renderInsertData,
      insertObj,
    });
    const err: RenderJobEnqueueError = new RenderJobEnqueueError(
      "RENDER job insert returned no row id",
    );
    return { error: err, retriable: false };
  }

  const newId: string = renderInsertData["id"];
  logger.info("[enqueueRenderJob] Enqueued RENDER job", {
    parent_job_id: jobId,
    render_job_id: newId,
  });

  return { renderJobId: newId };
}
