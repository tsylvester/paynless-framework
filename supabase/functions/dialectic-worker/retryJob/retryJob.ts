import type { Database } from "../../types_db.ts";
import type { ContributionGenerationRetryingPayload } from "../../_shared/types/notification.service.types.ts";
import {
  RetryJobUpdateError,
  RetryJobNotificationError,
  type RetryJobFn,
} from "./retryJob.interface.ts";

export const retryJob: RetryJobFn = async (deps, params, payload) => {
  const updatePayload: Database["public"]["Tables"]["dialectic_generation_jobs"]["Update"] = {
    status: "retrying",
    attempt_count: params.job.attempt_count + 1,
    error_details: {
      failedAttempts: payload.failedAttempts.map((e) => ({ ...e })),
    },
  };

  const { error } = await params.dbClient
    .from("dialectic_generation_jobs")
    .update(updatePayload)
    .eq("id", params.job.id);

  if (error) {
    const updateError = new RetryJobUpdateError({
      jobId: params.job.id,
      attemptedStatus: "retrying",
      driverMessage: error.message,
    });
    deps.logger.error(
      `[dialectic-worker] [retryJob] Failed to update job status to 'retrying': ${error.message}`,
      { error },
    );
    return { error: updateError, retriable: true };
  }

  const notificationPayload: ContributionGenerationRetryingPayload = {
    type: "contribution_generation_retrying",
    sessionId: params.job.session_id,
    modelId: payload.failedAttempts[0].modelId,
    iterationNumber: params.job.iteration_number,
    error: `Attempt ${params.job.attempt_count} failed. Retrying...`,
    job_id: params.job.id,
  };

  try {
    await deps.notificationService.sendContributionRetryingEvent(
      notificationPayload,
      params.job.user_id,
    );
    return { notified: true };
  } catch (caught: unknown) {
    if (caught instanceof Error) {
      deps.logger.error(
        `[dialectic-worker] [retryJob] Failed to send notification: ${caught.message}`,
        { error: caught },
      );
      return { notified: false, notificationError: caught };
    }
    deps.logger.error(
      `[dialectic-worker] [retryJob] Failed to send notification: ${caught}`,
      { error: caught },
    );
    const notificationError = new RetryJobNotificationError({
      jobId: params.job.id,
      thrownValue: String(caught),
    });
    return { notified: false, notificationError };
  }
};
