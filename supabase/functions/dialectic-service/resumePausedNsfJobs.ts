import type { SupabaseClient, User } from "npm:@supabase/supabase-js";
import type {
  ResumePausedNsfJobsPayload,
  ResumePausedNsfJobsResponse,
  ResumePausedNsfJobsResult,
} from "./dialectic.interface.ts";
import type { ServiceError } from "../_shared/types.ts";
import { logger } from "../_shared/logger.ts";

export async function handleResumePausedNsfJobs(
  payload: ResumePausedNsfJobsPayload,
  adminClient: SupabaseClient,
  user: User | null,
): Promise<ResumePausedNsfJobsResult> {
  if (!user) {
    const error: ServiceError = {
      message: "User not authenticated",
      status: 401,
      code: "USER_AUTH_FAILED",
    };
    return { status: 401, error };
  }

  const { data, error } = await adminClient.rpc("resume_paused_nsf_jobs", {
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

  const response: ResumePausedNsfJobsResponse = { resumedCount: data };
  return { status: 200, data: response };
}
