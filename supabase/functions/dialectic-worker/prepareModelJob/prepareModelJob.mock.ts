// supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.mock.ts

import { MockLogger } from "../../_shared/logger.mock.ts";
import { applyInputsRequiredScope } from "../../_shared/utils/applyInputsRequiredScope.ts";
import { validateWalletBalance } from "../../_shared/utils/validateWalletBalance.ts";
import { validateModelCostRates } from "../../_shared/utils/validateModelCostRates.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import {
  buildDialecticJobRow,
  buildPromptConstructionPayload,
} from "../../_shared/dialectic.mock.ts";
import { mockBoundCalculateAffordability } from "../calculateAffordability/calculateAffordability.mock.ts";
import { mockBoundEnqueueModelCallFn } from "../enqueueModelCall/enqueueModelCall.mock.ts";
import { mockBoundCompressPrompt } from "../compressPrompt/compressPrompt.mock.ts";
import { createMockUserTokenWalletService } from "../../_shared/services/tokenwallet/client/userTokenWalletService.mock.ts";
import type {
  BoundPrepareModelJobFn,
  PrepareModelJobDeps,
  PrepareModelJobErrorReturn,
  PrepareModelJobFn,
  PrepareModelJobParams,
  PrepareModelJobPayload,
  PrepareModelJobPendingReturn,
  PrepareModelJobQueuedReturn,
} from "./prepareModelJob.interface.ts";

// ── Owned object type: PrepareModelJobDeps ────────────────────────────────────

export type PrepareModelJobDepsOverrides = Partial<PrepareModelJobDeps>;

export function buildPrepareModelJobDeps(
  overrides?: PrepareModelJobDepsOverrides,
): PrepareModelJobDeps {
  const base: PrepareModelJobDeps = {
    logger: new MockLogger(),
    applyInputsRequiredScope,
    tokenWalletService: createMockUserTokenWalletService().instance,
    validateWalletBalance,
    validateModelCostRates,
    calculateAffordability: mockBoundCalculateAffordability,
    enqueueModelCall: mockBoundEnqueueModelCallFn,
    compressPrompt: mockBoundCompressPrompt,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareModelJobDepsCorruptions = {
  [K in keyof PrepareModelJobDeps]?: unknown;
};

export function invalidatePrepareModelJobDeps(
  corruptions: PrepareModelJobDepsCorruptions,
): unknown {
  return { ...buildPrepareModelJobDeps(), ...corruptions };
}

// ── Owned object type: PrepareModelJobParams ──────────────────────────────────

export type PrepareModelJobParamsOverrides = Partial<PrepareModelJobParams>;

export function buildPrepareModelJobParams(
  overrides?: PrepareModelJobParamsOverrides,
): PrepareModelJobParams {
  const mockSetup = createMockSupabaseClient(undefined, {});
  const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
  const base: PrepareModelJobParams = {
    dbClient,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareModelJobParamsCorruptions = {
  [K in keyof PrepareModelJobParams]?: unknown;
};

export function invalidatePrepareModelJobParams(
  corruptions: PrepareModelJobParamsCorruptions,
): unknown {
  return { ...buildPrepareModelJobParams(), ...corruptions };
}

// ── Owned object type: PrepareModelJobPayload ─────────────────────────────────

export type PrepareModelJobPayloadOverrides = Partial<PrepareModelJobPayload>;

export function buildPrepareModelJobPayload(
  overrides?: PrepareModelJobPayloadOverrides,
): PrepareModelJobPayload {
  const base: PrepareModelJobPayload = {
    job: buildDialecticJobRow(),
    providerRow: buildMockProvider(),
    promptConstructionPayload: buildPromptConstructionPayload(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareModelJobPayloadCorruptions = {
  [K in keyof PrepareModelJobPayload]?: unknown;
};

export function invalidatePrepareModelJobPayload(
  corruptions: PrepareModelJobPayloadCorruptions,
): unknown {
  return { ...buildPrepareModelJobPayload(), ...corruptions };
}

// ── Owned object type: PrepareModelJobQueuedReturn ────────────────────────────

export type PrepareModelJobQueuedReturnOverrides = Partial<PrepareModelJobQueuedReturn>;

export function buildPrepareModelJobQueuedReturn(
  overrides?: PrepareModelJobQueuedReturnOverrides,
): PrepareModelJobQueuedReturn {
  const base: PrepareModelJobQueuedReturn = { queued: true };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareModelJobQueuedReturnCorruptions = {
  [K in keyof PrepareModelJobQueuedReturn]?: unknown;
};

export function invalidatePrepareModelJobQueuedReturn(
  corruptions: PrepareModelJobQueuedReturnCorruptions,
): unknown {
  return { ...buildPrepareModelJobQueuedReturn(), ...corruptions };
}

// ── Owned object type: PrepareModelJobPendingReturn ───────────────────────────

export type PrepareModelJobPendingReturnOverrides = Partial<PrepareModelJobPendingReturn>;

export function buildPrepareModelJobPendingReturn(
  overrides?: PrepareModelJobPendingReturnOverrides,
): PrepareModelJobPendingReturn {
  const base: PrepareModelJobPendingReturn = { waiting_for_children: true };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareModelJobPendingReturnCorruptions = {
  [K in keyof PrepareModelJobPendingReturn]?: unknown;
};

export function invalidatePrepareModelJobPendingReturn(
  corruptions: PrepareModelJobPendingReturnCorruptions,
): unknown {
  return { ...buildPrepareModelJobPendingReturn(), ...corruptions };
}

// ── Owned object type: PrepareModelJobErrorReturn ─────────────────────────────

export type PrepareModelJobErrorReturnOverrides = Partial<PrepareModelJobErrorReturn>;

export function buildPrepareModelJobErrorReturn(
  overrides?: PrepareModelJobErrorReturnOverrides,
): PrepareModelJobErrorReturn {
  const base: PrepareModelJobErrorReturn = {
    error: new Error("mock-prepare-error"),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PrepareModelJobErrorReturnCorruptions = {
  [K in keyof PrepareModelJobErrorReturn]?: unknown;
};

export function invalidatePrepareModelJobErrorReturn(
  corruptions: PrepareModelJobErrorReturnCorruptions,
): unknown {
  return { ...buildPrepareModelJobErrorReturn(), ...corruptions };
}

// ── Owned function type: PrepareModelJobFn ────────────────────────────────────

export const mockPrepareModelJob: PrepareModelJobFn = async (
  _deps,
  _params,
  _payload,
) => {
  return buildPrepareModelJobQueuedReturn();
};

export const mockBoundPrepareModelJob: BoundPrepareModelJobFn = async (
  _params,
  _payload,
) => {
  return buildPrepareModelJobQueuedReturn();
};
