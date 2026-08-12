import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  buildDialecticContributionRow,
  buildDialecticJobRow,
} from "../../_shared/dialectic.mock.ts";
import {
  ContinueJobDeps,
  ContinueJobEnqueuedReturn,
  ContinueJobErrorReturn,
  ContinueJobFn,
  ContinueJobLimitReachedReturn,
  ContinueJobParams,
  ContinueJobPayload,
  ContinueJobReturn,
  ContinueJobValidationError,
} from "./continueJob.interface.ts";

export type ContinueJobDepsOverrides = Partial<ContinueJobDeps>;

export type ContinueJobParamsOverrides = Partial<ContinueJobParams>;

export type ContinueJobPayloadOverrides = Partial<ContinueJobPayload>;

export type ContinueJobEnqueuedReturnOverrides = Partial<ContinueJobEnqueuedReturn>;

export type ContinueJobLimitReachedReturnOverrides = Partial<ContinueJobLimitReachedReturn>;

export type ContinueJobErrorReturnOverrides = Partial<ContinueJobErrorReturn>;

export function buildContinueJobDeps(
  overrides?: ContinueJobDepsOverrides,
): ContinueJobDeps {
  const base: ContinueJobDeps = {
    logger: new MockLogger(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildContinueJobParams(
  overrides?: ContinueJobParamsOverrides,
): ContinueJobParams {
  const mockSetup = createMockSupabaseClient("continue-job");
  const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
  const base: ContinueJobParams = {
    dbClient,
    projectOwnerUserId: "user-1",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildContinueJobPayload(
  overrides?: ContinueJobPayloadOverrides,
): ContinueJobPayload {
  const base: ContinueJobPayload = {
    job: buildDialecticJobRow(),
    savedOutput: buildDialecticContributionRow(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildContinueJobEnqueuedReturn(
  overrides?: ContinueJobEnqueuedReturnOverrides,
): ContinueJobEnqueuedReturn {
  const base: ContinueJobEnqueuedReturn = { enqueued: true };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildContinueJobLimitReachedReturn(
  overrides?: ContinueJobLimitReachedReturnOverrides,
): ContinueJobLimitReachedReturn {
  const base: ContinueJobLimitReachedReturn = {
    enqueued: false,
    reason: "continuation_limit_reached",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export function buildContinueJobErrorReturn(
  overrides?: ContinueJobErrorReturnOverrides,
): ContinueJobErrorReturn {
  const base: ContinueJobErrorReturn = {
    error: new ContinueJobValidationError("mock-continue-job-error"),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ContinueJobDepsCorruptions = { [K in keyof ContinueJobDeps]?: unknown };

export type ContinueJobParamsCorruptions = { [K in keyof ContinueJobParams]?: unknown };

export type ContinueJobPayloadCorruptions = { [K in keyof ContinueJobPayload]?: unknown };

export type ContinueJobEnqueuedReturnCorruptions = { [K in keyof ContinueJobEnqueuedReturn]?: unknown };

export type ContinueJobLimitReachedReturnCorruptions = { [K in keyof ContinueJobLimitReachedReturn]?: unknown };

export type ContinueJobErrorReturnCorruptions = { [K in keyof ContinueJobErrorReturn]?: unknown };

export function invalidateContinueJobDeps(
  corruptions: ContinueJobDepsCorruptions,
): unknown {
  return { ...buildContinueJobDeps(), ...corruptions };
}

export function invalidateContinueJobParams(
  corruptions: ContinueJobParamsCorruptions,
): unknown {
  return { ...buildContinueJobParams(), ...corruptions };
}

export function invalidateContinueJobPayload(
  corruptions: ContinueJobPayloadCorruptions,
): unknown {
  return { ...buildContinueJobPayload(), ...corruptions };
}

export function invalidateContinueJobEnqueuedReturn(
  corruptions: ContinueJobEnqueuedReturnCorruptions,
): unknown {
  return { ...buildContinueJobEnqueuedReturn(), ...corruptions };
}

export function invalidateContinueJobLimitReachedReturn(
  corruptions: ContinueJobLimitReachedReturnCorruptions,
): unknown {
  return { ...buildContinueJobLimitReachedReturn(), ...corruptions };
}

export function invalidateContinueJobErrorReturn(
  corruptions: ContinueJobErrorReturnCorruptions,
): unknown {
  return { ...buildContinueJobErrorReturn(), ...corruptions };
}

export const mockContinueJob: ContinueJobFn = async (
  _deps: ContinueJobDeps,
  _params: ContinueJobParams,
  _payload: ContinueJobPayload,
): Promise<ContinueJobReturn> => {
  return buildContinueJobEnqueuedReturn();
};
