import type { SupabaseClient, User } from "npm:@supabase/supabase-js";
import type {
  RegenerateDocumentPayload,
  RegenerateDocumentResponse,
  RegenerateDocumentResult,
} from "./dialectic.interface.ts";
import type { TablesInsert } from "../types_db.ts";
import type { ServiceError } from "../_shared/types.ts";
import { logger } from "../_shared/logger.ts";
import { isRecord } from "../_shared/utils/type-guards/type_guards.common.ts";
import { isDialecticJobRow } from "../_shared/utils/type-guards/type_guards.dialectic.ts";

function isValidRegeneratePayload(
  value: unknown,
): value is RegenerateDocumentPayload {
  if (!isRecord(value)) return false;
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

export async function regenerateDocument(
  payload: RegenerateDocumentPayload,
  dbClient: SupabaseClient,
  user: User | null,
): Promise<RegenerateDocumentResult> {
  if (!user) {
    const error: ServiceError = {
      message: "User not authenticated",
      status: 401,
      code: "USER_AUTH_FAILED",
    };
    return { status: 401, error };
  }

  if (!isValidRegeneratePayload(payload)) {
    const error: ServiceError = {
      message: "Invalid payload: sessionId, stageSlug, iterationNumber, and documents array with documentKey and modelId required",
      status: 400,
      code: "VALIDATION_ERROR",
    };
    return { status: 400, error };
  }

  const { data: sessionData, error: sessionError } = await dbClient
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

    if (!isDialecticJobRow(jobData)) {
      logger.error("regenerateDocument: job row shape invalid", {
        documentKey: docRef.documentKey,
        modelId: docRef.modelId,
      });
      const error: ServiceError = {
        message: "Invalid job data",
        status: 500,
        code: "DB_ERROR",
      };
      return { status: 500, error };
    }

    const job = jobData;

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
      .then((r) => r.error);

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

    const cloneRow: TablesInsert<"dialectic_generation_jobs"> = {
      session_id: job.session_id,
      user_id: job.user_id,
      stage_slug: job.stage_slug,
      iteration_number: job.iteration_number,
      payload: job.payload,
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
      target_contribution_id: null,
      is_test_job: job.is_test_job,
    };

    const { data: inserted, error: insertError } = await dbClient
      .from("dialectic_generation_jobs")
      .insert(cloneRow)
      .select("id")
      .single();

    if (insertError) {
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
