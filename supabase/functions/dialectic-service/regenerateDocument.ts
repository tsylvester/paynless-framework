
import type {
  RegenerateDocumentPayload,
  RegenerateDocumentResponse,
  RegenerateDocumentResult,
  RegenerateDocumentFn,
  RegenerateDocumentParams,
  RegenerateDocumentDeps,
  DialecticJobRow,
} from "./dialectic.interface.ts";
import type { TablesInsert, TablesUpdate } from "../types_db.ts";
import type { ServiceError } from "../_shared/types.ts";
import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";
import type { PostgrestSingleResponse } from "npm:@supabase/supabase-js";

function isValidRegeneratePayload(
  value: unknown,
): value is RegenerateDocumentPayload {
  if (!isRecord(value)) return false;
  if (typeof value["idempotencyKey"] !== "string") return false;
  if (value["idempotencyKey"].trim().length === 0) return false;
  if (typeof value["sessionId"] !== "string" || value["sessionId"].length === 0)
    return false;
  if (typeof value["stageSlug"] !== "string" || value["stageSlug"].length === 0)
    return false;
  if (typeof value["iterationNumber"] !== "number") return false;
  const documents = value["documents"];
  if (!Array.isArray(documents)) return false;
  for (const entry of documents) {
    if (!isRecord(entry)) return false;
    if (typeof entry["documentKey"] !== "string" || entry["documentKey"].length === 0)
      return false;
    if (typeof entry["modelId"] !== "string" || entry["modelId"].length === 0)
      return false;
  }
  return true;
}

export const regenerateDocument: RegenerateDocumentFn = async (
  payload: RegenerateDocumentPayload,
  params: RegenerateDocumentParams,
  deps: RegenerateDocumentDeps,
): Promise<RegenerateDocumentResult> => {
  const { user, authToken } = params;
  if (!user) {
    const error: ServiceError = {
      message: "User not authenticated",
      status: 401,
      code: "USER_AUTH_FAILED",
    };
    return { status: 401, error };
  }
  if (!authToken) {
    const error: ServiceError = {
      message: "Authentication token is required",
      status: 401,
      code: "AUTH_TOKEN_MISSING",
    };
    return { status: 401, error };
  }
  const { dbClient, logger } = deps;

  if (!isValidRegeneratePayload(payload)) {
    const error: ServiceError = {
      message: "Invalid payload: sessionId, stageSlug, iterationNumber, and documents array with documentKey and modelId required",
      status: 400,
      code: "VALIDATION_ERROR",
    };
    return { status: 400, error };
  }

  const { data: sessionData, error: sessionError } = await deps.dbClient
    .from("dialectic_sessions")
    .select("id, current_stage:current_stage_id(slug)")
    .eq("id", payload.sessionId)
    .single();

  if (sessionError) {
    if (sessionError.code === "PGRST116") {
      const error: ServiceError = {
        message: "Session not found",
        status: 404,
        code: "NOT_FOUND",
      };
      return { status: 404, error };
    }
    logger.error("regenerateDocument: failed to fetch session", {
      sessionId: payload.sessionId,
      error: sessionError.message,
    });
    const error: ServiceError = {
      message: sessionError.message,
      status: 500,
      code: "DB_ERROR",
    };
    return { status: 500, error };
  }

  if (!sessionData) {
    const error: ServiceError = {
      message: "Session not found",
      status: 404,
      code: "NOT_FOUND",
    };
    return { status: 404, error };
  }

  const currentStage = sessionData.current_stage;
  const stageSlug =
    currentStage &&
    !Array.isArray(currentStage) &&
    isRecord(currentStage) &&
    typeof currentStage["slug"] === "string"
      ? currentStage["slug"]
      : null;
  if (stageSlug !== payload.stageSlug) {
    const error: ServiceError = {
      message: "Session current stage does not match the requested stage",
      status: 400,
      code: "STAGE_MISMATCH",
    };
    return { status: 400, error };
  }

  const jobIds: string[] = [];

  for (const docRef of payload.documents) {
    const jobIdempotencyKey: string = `${payload.idempotencyKey}_${docRef.documentKey}_${docRef.modelId}`;

    const { data: existingClone, error: existingCloneError } = await dbClient
      .from("dialectic_generation_jobs")
      .select("id")
      .eq("idempotency_key", jobIdempotencyKey)
      .eq("session_id", payload.sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingCloneError && existingClone && typeof existingClone.id === "string") {
      jobIds.push(existingClone.id);
      continue;
    }

    if (existingCloneError) {
      logger.error("regenerateDocument: failed to check existing clone", {
        jobIdempotencyKey,
        error: existingCloneError.message,
      });
      const error: ServiceError = {
        message: existingCloneError.message,
        status: 500,
        code: "DB_ERROR",
      };
      return { status: 500, error };
    }

    const { data: jobRows, error: jobError } = await dbClient
      .from("dialectic_generation_jobs")
      .select("*")
      .eq("session_id", payload.sessionId)
      .eq("stage_slug", payload.stageSlug)
      .eq("iteration_number", payload.iterationNumber)
      .eq("user_id", user.id)
      .eq("job_type", "EXECUTE")
      .neq("status", "superseded")
      .filter("payload->>document_key", "eq", docRef.documentKey)
      .filter("payload->>model_id", "eq", docRef.modelId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (jobError) {
      logger.error("regenerateDocument: failed to fetch job", {
        documentKey: docRef.documentKey,
        modelId: docRef.modelId,
        error: jobError.message,
      });
      const error: ServiceError = {
        message: jobError.message,
        status: 500,
        code: "DB_ERROR",
      };
      return { status: 500, error };
    }

    const jobData = jobRows?.[0] ?? null;
    if (!jobData) {
      const error: ServiceError = {
        message: `No EXECUTE job found for documentKey '${docRef.documentKey}' and modelId '${docRef.modelId}'`,
        status: 404,
        code: "NOT_FOUND",
      };
      return { status: 404, error };
    }

    const job: DialecticJobRow = jobData;

    if (job.session_id !== payload.sessionId) {
      const error: ServiceError = {
        message: "Job does not belong to this session",
        status: 403,
        code: "FORBIDDEN",
      };
      return { status: 403, error };
    }

    if (job.user_id !== user.id) {
      const error: ServiceError = {
        message: "You do not own this job",
        status: 403,
        code: "FORBIDDEN",
      };
      return { status: 403, error };
    }

    if (job.job_type !== "EXECUTE") {
      const error: ServiceError = {
        message: "Only EXECUTE jobs can be regenerated",
        status: 400,
        code: "INVALID_JOB_TYPE",
      };
      return { status: 400, error };
    }

    const updateError = await dbClient
      .from("dialectic_generation_jobs")
      .update({ status: "superseded" })
      .eq("id", job.id)
      .then((r: PostgrestSingleResponse<null | TablesUpdate<"dialectic_generation_jobs">>) => r.error);

    if (updateError) {
      logger.error("regenerateDocument: failed to mark job superseded", {
        jobId: job.id,
        documentKey: docRef.documentKey,
        modelId: docRef.modelId,
        error: updateError.message,
      });
      const error: ServiceError = {
        message: updateError.message,
        status: 500,
        code: "DB_ERROR",
      };
      return { status: 500, error };
    }

    const clonePayload = Object.assign({}, job.payload, { user_jwt: params.authToken });
    const cloneRow: TablesInsert<"dialectic_generation_jobs"> = {
      session_id: job.session_id,
      user_id: job.user_id,
      stage_slug: job.stage_slug,
      iteration_number: job.iteration_number,
      payload: clonePayload,
      status: "pending",
      attempt_count: 0,
      max_retries: job.max_retries,
      job_type: job.job_type,
      parent_job_id: job.parent_job_id,
      prerequisite_job_id: job.prerequisite_job_id,
      started_at: null,
      completed_at: null,
      results: null,
      error_details: null,
      target_contribution_id: typeof job.target_contribution_id === "string" ? job.target_contribution_id : null,
      is_test_job: job.is_test_job,
      idempotency_key: jobIdempotencyKey,
    };

    const { data: inserted, error: insertError } = await dbClient
      .from("dialectic_generation_jobs")
      .insert(cloneRow)
      .select("id")
      .single();

    if (insertError) {
      const isUniqueViolationOnIdempotencyKey: boolean =
        insertError.code === "23505" &&
        typeof insertError.message === "string" &&
        insertError.message.includes("idempotency_key");
      if (isUniqueViolationOnIdempotencyKey) {
        const { data: existingJob, error: selectError } = await dbClient
          .from("dialectic_generation_jobs")
          .select("id")
          .eq("idempotency_key", jobIdempotencyKey)
          .eq("session_id", payload.sessionId)
          .eq("user_id", user.id)
          .single();
        if (!selectError && existingJob && typeof existingJob.id === "string") {
          jobIds.push(existingJob.id);
          continue;
        }
      }
      logger.error("regenerateDocument: failed to insert clone job", {
        originalJobId: job.id,
        documentKey: docRef.documentKey,
        modelId: docRef.modelId,
        error: insertError.message,
      });
      const error: ServiceError = {
        message: insertError.message,
        status: 500,
        code: "DB_ERROR",
      };
      return { status: 500, error };
    }

    if (!inserted || typeof inserted.id !== "string") {
      const error: ServiceError = {
        message: "Insert did not return job id",
        status: 500,
        code: "DB_ERROR",
      };
      return { status: 500, error };
    }

    jobIds.push(inserted.id);
  }

  const response: RegenerateDocumentResponse = { jobIds };
  return { status: 200, data: response };
}
