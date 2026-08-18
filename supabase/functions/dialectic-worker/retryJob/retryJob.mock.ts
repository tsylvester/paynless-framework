import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { mockNotificationService } from "../../_shared/utils/notification.service.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  buildDialecticJobRow,
  buildFailedAttemptError,
} from "../../_shared/dialectic.mock.ts";
import {
  RetryJobDeps,
  RetryJobParams,
  RetryJobPayload,
  RetryJobNotifiedReturn,
  RetryJobNotificationFailedReturn,
  RetryJobErrorReturn,
  RetryJobReturn,
  RetryJobFn,
  RetryJobUpdateError,
  RetryJobUpdateErrorConstructorParams,
  RetryJobNotificationError,
  RetryJobNotificationErrorConstructorParams,
} from "./retryJob.interface.ts";

// --- RetryJobDeps ---

export type RetryJobDepsOverrides = Partial<RetryJobDeps>;

export function buildRetryJobDeps(
  overrides?: RetryJobDepsOverrides,
): RetryJobDeps {
  const base: RetryJobDeps = {
    logger: new MockLogger(),
    notificationService: mockNotificationService,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type RetryJobDepsCorruptions = { [K in keyof RetryJobDeps]?: unknown };

export function invalidateRetryJobDeps(
  corruptions: RetryJobDepsCorruptions,
): unknown {
  return { ...buildRetryJobDeps(), ...corruptions };
}

// --- RetryJobParams ---

export type RetryJobParamsOverrides = Partial<RetryJobParams>;

export function buildRetryJobParams(
  overrides?: RetryJobParamsOverrides,
): RetryJobParams {
  const mockSetup = createMockSupabaseClient(undefined, {});
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const job = buildDialecticJobRow();
  const base: RetryJobParams = {
    dbClient,
    job,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type RetryJobParamsCorruptions = {
  [K in keyof RetryJobParams]?: unknown;
};

export function invalidateRetryJobParams(
  corruptions: RetryJobParamsCorruptions,
): unknown {
  return { ...buildRetryJobParams(), ...corruptions };
}

// --- RetryJobPayload ---

export type RetryJobPayloadOverrides = Partial<RetryJobPayload>;

export function buildRetryJobPayload(
  overrides?: RetryJobPayloadOverrides,
): RetryJobPayload {
  const base: RetryJobPayload = {
    failedAttempts: [buildFailedAttemptError()],
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type RetryJobPayloadCorruptions = {
  [K in keyof RetryJobPayload]?: unknown;
};

export function invalidateRetryJobPayload(
  corruptions: RetryJobPayloadCorruptions,
): unknown {
  return { ...buildRetryJobPayload(), ...corruptions };
}

// --- RetryJobNotifiedReturn ---

export type RetryJobNotifiedReturnOverrides = Partial<RetryJobNotifiedReturn>;

export function buildRetryJobNotifiedReturn(
  overrides?: RetryJobNotifiedReturnOverrides,
): RetryJobNotifiedReturn {
  const base: RetryJobNotifiedReturn = { notified: true };
  return overrides ? { ...base, ...overrides } : base;
}

export type RetryJobNotifiedReturnCorruptions = {
  [K in keyof RetryJobNotifiedReturn]?: unknown;
};

export function invalidateRetryJobNotifiedReturn(
  corruptions: RetryJobNotifiedReturnCorruptions,
): unknown {
  return { ...buildRetryJobNotifiedReturn(), ...corruptions };
}

// --- RetryJobNotificationFailedReturn ---

export type RetryJobNotificationFailedReturnOverrides =
  Partial<RetryJobNotificationFailedReturn>;

export function buildRetryJobNotificationFailedReturn(
  overrides?: RetryJobNotificationFailedReturnOverrides,
): RetryJobNotificationFailedReturn {
  const base: RetryJobNotificationFailedReturn = {
    notified: false,
    notificationError: buildRetryJobNotificationError(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type RetryJobNotificationFailedReturnCorruptions = {
  [K in keyof RetryJobNotificationFailedReturn]?: unknown;
};

export function invalidateRetryJobNotificationFailedReturn(
  corruptions: RetryJobNotificationFailedReturnCorruptions,
): unknown {
  return { ...buildRetryJobNotificationFailedReturn(), ...corruptions };
}

// --- RetryJobErrorReturn ---

export type RetryJobErrorReturnOverrides = Partial<RetryJobErrorReturn>;

export function buildRetryJobErrorReturn(
  overrides?: RetryJobErrorReturnOverrides,
): RetryJobErrorReturn {
  const base: RetryJobErrorReturn = {
    error: buildRetryJobUpdateError(),
    retriable: true,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type RetryJobErrorReturnCorruptions = {
  [K in keyof RetryJobErrorReturn]?: unknown;
};

export function invalidateRetryJobErrorReturn(
  corruptions: RetryJobErrorReturnCorruptions,
): unknown {
  return { ...buildRetryJobErrorReturn(), ...corruptions };
}

// --- RetryJobUpdateErrorConstructorParams ---

export type RetryJobUpdateErrorConstructorParamsOverrides =
  Partial<RetryJobUpdateErrorConstructorParams>;

export function buildRetryJobUpdateErrorConstructorParams(
  overrides?: RetryJobUpdateErrorConstructorParamsOverrides,
): RetryJobUpdateErrorConstructorParams {
  const base: RetryJobUpdateErrorConstructorParams = {
    jobId: "job-1",
    attemptedStatus: "retrying",
    driverMessage: "connection lost",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type RetryJobUpdateErrorConstructorParamsCorruptions = {
  [K in keyof RetryJobUpdateErrorConstructorParams]?: unknown;
};

export function invalidateRetryJobUpdateErrorConstructorParams(
  corruptions: RetryJobUpdateErrorConstructorParamsCorruptions,
): unknown {
  return { ...buildRetryJobUpdateErrorConstructorParams(), ...corruptions };
}

// --- RetryJobUpdateError (class — real instance, no instance invalidator) ---

export function buildRetryJobUpdateError(
  overrides?: RetryJobUpdateErrorConstructorParamsOverrides,
): RetryJobUpdateError {
  return new RetryJobUpdateError(
    buildRetryJobUpdateErrorConstructorParams(overrides),
  );
}

// --- RetryJobNotificationErrorConstructorParams ---

export type RetryJobNotificationErrorConstructorParamsOverrides =
  Partial<RetryJobNotificationErrorConstructorParams>;

export function buildRetryJobNotificationErrorConstructorParams(
  overrides?: RetryJobNotificationErrorConstructorParamsOverrides,
): RetryJobNotificationErrorConstructorParams {
  const base: RetryJobNotificationErrorConstructorParams = {
    jobId: "job-1",
    thrownValue: "string thrown value",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type RetryJobNotificationErrorConstructorParamsCorruptions = {
  [K in keyof RetryJobNotificationErrorConstructorParams]?: unknown;
};

export function invalidateRetryJobNotificationErrorConstructorParams(
  corruptions: RetryJobNotificationErrorConstructorParamsCorruptions,
): unknown {
  return { ...buildRetryJobNotificationErrorConstructorParams(), ...corruptions };
}

// --- RetryJobNotificationError (class — real instance, no instance invalidator) ---

export function buildRetryJobNotificationError(
  overrides?: RetryJobNotificationErrorConstructorParamsOverrides,
): RetryJobNotificationError {
  return new RetryJobNotificationError(
    buildRetryJobNotificationErrorConstructorParams(overrides),
  );
}

// --- RetryJobFn (function mock — no configuration) ---

export const mockRetryJob: RetryJobFn = async (
  _deps,
  _params,
  _payload,
): Promise<RetryJobReturn> => {
  return buildRetryJobNotifiedReturn();
};
