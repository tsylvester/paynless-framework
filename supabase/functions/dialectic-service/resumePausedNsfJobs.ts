import type {
  ResumePausedNsfJobsPayload,
  ResumePausedNsfJobsResponse,
  ResumePausedNsfJobsResult,
  ResumePausedNsfJobsParams,
  ResumePausedNsfJobsDeps,
} from "./dialectic.interface.ts";
import type { ServiceError } from "../_shared/types.ts";
import type { Json, TablesUpdate } from "../types_db.ts";
import type { PostgrestSingleResponse } from "npm:@supabase/supabase-js";
import { logger } from "../_shared/logger.ts";

export async function handleResumePausedNsfJobs(
  payload: ResumePausedNsfJobsPayload,
  params: ResumePausedNsfJobsParams,
  deps: ResumePausedNsfJobsDeps,
): Promise<ResumePausedNsfJobsResult> {
  if (!params.user) {
    const error: ServiceError = {
      message: "User not authenticated",
      status: 401,
      code: "USER_AUTH_FAILED",
    };
    return { status: 401, error };
  }

  if (!params.authToken) {
    const error: ServiceError = {
      message: "Authentication token is required",
      status: 401,
      code: "AUTH_TOKEN_MISSING",
    };
    return { status: 401, error };
  }

  const { data, error } = await deps.adminClient.rpc("resume_paused_nsf_jobs", {
    p_session_id: payload.sessionId,
    p_stage_slug: payload.stageSlug,
    p_iteration_number: payload.iterationNumber,
  });

  if (error) {
    logger.error("resumePausedNsfJobs: RPC failed", {
      error: error.message,
      sessionId: payload.sessionId,
      stageSlug: payload.stageSlug,
      iterationNumber: payload.iterationNumber,
    });
    const serviceError: ServiceError = {
      message: error.message,
      status: 500,
      code: "RESUME_FAILED",
    };
    return { status: 500, error: serviceError };
  }

  if (typeof data !== "number") {
    logger.error("resumePausedNsfJobs: RPC returned non-number", {
      sessionId: payload.sessionId,
      stageSlug: payload.stageSlug,
      iterationNumber: payload.iterationNumber,
    });
    const serviceError: ServiceError = {
      message: "resume_paused_nsf_jobs returned invalid result",
      status: 500,
      code: "RESUME_FAILED",
    };
    return { status: 500, error: serviceError };
  }

  if (data > 0) {
    const { data: jobs, error: selectError } = await deps.adminClient
      .from("dialectic_generation_jobs")
      .select("id, payload")
      .eq("session_id", payload.sessionId)
      .eq("stage_slug", payload.stageSlug)
      .eq("iteration_number", payload.iterationNumber)
      .in("status", ["pending", "retrying"]);

    if (!selectError && jobs && jobs.length > 0) {
      for (const row of jobs) {
        const rawPayload: Json = row.payload ?? {};
        const base: { [key: string]: Json | undefined } =
          typeof rawPayload === "object" && rawPayload !== null && !Array.isArray(rawPayload)
            ? rawPayload
            : {};
        const mergedPayload: Json = Object.assign({}, base, { user_jwt: params.authToken });
        const updateError = await deps.adminClient
          .from("dialectic_generation_jobs")
          .update({ payload: mergedPayload })
          .eq("id", row.id)
          .then((r: PostgrestSingleResponse<null | TablesUpdate<"dialectic_generation_jobs">>) => r.error);

        if (updateError) {
          logger.warn("resumePausedNsfJobs: JWT refresh failed for job", {
            jobId: row.id,
            sessionId: payload.sessionId,
            error: updateError.message,
          });
        }
      }
    }
  }

  const response: ResumePausedNsfJobsResponse = { resumedCount: data };
  return { status: 200, data: response };
}
