import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import type { DialecticJobRow, FailedAttemptError } from "../../dialectic-service/dialectic.interface.ts";
import type { ILogger } from "../../_shared/types.ts";
import type { NotificationServiceType } from "../../_shared/types/notification.service.types.ts";

export interface RetryJobDeps {
  logger: ILogger;
  notificationService: NotificationServiceType;
}

export interface RetryJobParams {
  dbClient: SupabaseClient<Database>;
  job: DialecticJobRow;
}

export interface RetryJobPayload {
  failedAttempts: FailedAttemptError[];
}

export type RetryJobNotifiedReturn = { notified: true };

export type RetryJobNotificationFailedReturn = {
  notified: false;
  notificationError: Error;
};

export type RetryJobSuccessReturn =
  | RetryJobNotifiedReturn
  | RetryJobNotificationFailedReturn;

export type RetryJobErrorReturn = {
  error: RetryJobUpdateError;
  retriable: boolean;
};

export type RetryJobReturn = RetryJobSuccessReturn | RetryJobErrorReturn;

export type RetryJobFn = (
  deps: RetryJobDeps,
  params: RetryJobParams,
  payload: RetryJobPayload,
) => Promise<RetryJobReturn>;

export interface RetryJobUpdateErrorConstructorParams {
  jobId: string;
  attemptedStatus: string;
  driverMessage: string;
}

export class RetryJobUpdateError extends Error {
  readonly jobId: string;
  readonly attemptedStatus: string;
  readonly driverMessage: string;

  constructor(params: RetryJobUpdateErrorConstructorParams) {
    super(
      `Failed to update job ${params.jobId} status to '${params.attemptedStatus}': ${params.driverMessage}`,
    );
    this.name = "RetryJobUpdateError";
    this.jobId = params.jobId;
    this.attemptedStatus = params.attemptedStatus;
    this.driverMessage = params.driverMessage;
  }
}

export interface RetryJobNotificationErrorConstructorParams {
  jobId: string;
  thrownValue: string;
}

export class RetryJobNotificationError extends Error {
  readonly jobId: string;
  readonly thrownValue: string;

  constructor(params: RetryJobNotificationErrorConstructorParams) {
    super(`Failed to send notification for job ${params.jobId}: ${params.thrownValue}`);
    this.name = "RetryJobNotificationError";
    this.jobId = params.jobId;
    this.thrownValue = params.thrownValue;
  }
}
