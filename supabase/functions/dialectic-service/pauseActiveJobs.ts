import type { SupabaseClient, User } from "npm:@supabase/supabase-js";
import type {
  PauseActiveJobsPayload,
  PauseActiveJobsResponse,
  PauseActiveJobsResult,
  PauseActiveJobsDeps,
} from "./dialectic.interface.ts";
import type { ServiceError } from "../_shared/types.ts";
import { logger } from "../_shared/logger.ts";

export async function handlePauseActiveJobs(
  payload: PauseActiveJobsPayload,
  _deps: PauseActiveJobsDeps,
  adminClient: SupabaseClient,
  user: User | null,
): Promise<PauseActiveJobsResult> {
  if (!user) {
    const error: ServiceError = {
      message: "User not authenticated",
      status: 401,
      code: "USER_AUTH_FAILED",
    };
    return { status: 401, error };
  }

  const { data, error } = await adminClient.rpc("pause_active_jobs", {
    p_session_id: payload.sessionId,
    p_stage_slug: payload.stageSlug,
    p_iteration_number: payload.iterationNumber,
  });

  if (error) {
    logger.error("pauseActiveJobs: RPC failed", {
      error: error.message,
      sessionId: payload.sessionId,
      stageSlug: payload.stageSlug,
      iterationNumber: payload.iterationNumber,
    });
    const serviceError: ServiceError = {
      message: error.message,
      status: 500,
      code: "PAUSE_ACTIVE_JOBS_FAILED",
    };
    return { status: 500, error: serviceError };
  }

  if (typeof data !== "number") {
    logger.error("pauseActiveJobs: RPC returned non-number", {
      sessionId: payload.sessionId,
      stageSlug: payload.stageSlug,
      iterationNumber: payload.iterationNumber,
    });
    const serviceError: ServiceError = {
      message: "pause_active_jobs returned invalid result",
      status: 500,
      code: "PAUSE_ACTIVE_JOBS_FAILED",
    };
    return { status: 500, error: serviceError };
  }

  const response: PauseActiveJobsResponse = { pausedCount: data };
  return { status: 200, data: response };
}
