import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { createMockCountTokens, buildCountTokensDeps } from "../../_shared/utils/tokenizer_utils.mock.ts";
import { constructStoragePath } from "../../_shared/utils/path_constructor.ts";
import { mockBoundAssembleCompressionPrompt } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.mock.ts";
import { mockBoundAssembleContinuationPrompt } from "../../_shared/prompt-assembler/assembleContinuationPrompt/assembleContinuationPrompt.mock.ts";
import { mockBoundEnqueueModelCallFn } from "../enqueueModelCall/enqueueModelCall.mock.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { mockJob } from "../processSimpleJob.mock.ts";
import { buildDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import {
    ProcessCompressJobError,
} from "./processCompressJob.interface.ts";
import type {
    BoundProcessCompressJobFn,
    ProcessCompressJobDeps,
    ProcessCompressJobErrorReturn,
    ProcessCompressJobFn,
    ProcessCompressJobParams,
    ProcessCompressJobPayload,
    ProcessCompressJobReturn,
    ProcessCompressJobSuccessReturn,
} from "./processCompressJob.interface.ts";

// ── ProcessCompressJobDeps ───────────────────────────────────────────────────

export type ProcessCompressJobDepsOverrides = Partial<ProcessCompressJobDeps>;

export function buildProcessCompressJobDeps(
    overrides?: ProcessCompressJobDepsOverrides,
): ProcessCompressJobDeps {
    const tokenizerDeps = buildCountTokensDeps();
    const base: ProcessCompressJobDeps = {
        assembleCompressionPrompt: mockBoundAssembleCompressionPrompt,
        assembleContinuationPrompt: mockBoundAssembleContinuationPrompt,
        enqueueModelCall: mockBoundEnqueueModelCallFn,
        countTokens: createMockCountTokens(),
        getEncoding: tokenizerDeps.getEncoding,
        countTokensAnthropic: tokenizerDeps.countTokensAnthropic,
        constructStoragePath: constructStoragePath,
        logger: new MockLogger(),
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type ProcessCompressJobDepsCorruptions = { [K in keyof ProcessCompressJobDeps]?: unknown };

export function invalidateProcessCompressJobDeps(
    corruptions: ProcessCompressJobDepsCorruptions,
): unknown {
    return { ...buildProcessCompressJobDeps(), ...corruptions };
}

// ── ProcessCompressJobParams ─────────────────────────────────────────────────

export type ProcessCompressJobParamsOverrides = Partial<ProcessCompressJobParams>;

export function buildProcessCompressJobParams(
    overrides?: ProcessCompressJobParamsOverrides,
): ProcessCompressJobParams {
    const mockSetup = createMockSupabaseClient("process-compress-job");
    const dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    const payload = buildDialecticCompressJobPayload();
    if (!isJson(payload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const job = mockJob({
        payload,
        job_type: "COMPRESS",
        session_id: payload.sessionId,
        stage_slug: payload.stageSlug,
        iteration_number: payload.iterationNumber,
        user_id: payload.user_id,
        idempotency_key: null,
    });

    const base: ProcessCompressJobParams = {
        dbClient,
        job,
        projectOwnerUserId: "user-1",
        authToken: "mock-user-jwt",
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type ProcessCompressJobParamsCorruptions = { [K in keyof ProcessCompressJobParams]?: unknown };

export function invalidateProcessCompressJobParams(
    corruptions: ProcessCompressJobParamsCorruptions,
): unknown {
    return { ...buildProcessCompressJobParams(), ...corruptions };
}

// ── ProcessCompressJobError (owned class) ────────────────────────────────────

export type ProcessCompressJobErrorOverrides = Partial<ProcessCompressJobError>;

export function buildProcessCompressJobError(
    overrides?: ProcessCompressJobErrorOverrides,
): ProcessCompressJobError {
    const message = overrides?.message !== undefined
        ? overrides.message
        : "mock-process-compress-job-error";
    const error = new ProcessCompressJobError(message);
    if (overrides?.name !== undefined) {
        error.name = overrides.name;
    }
    if (overrides?.stack !== undefined) {
        error.stack = overrides.stack;
    }
    if (overrides?.cause !== undefined) {
        error.cause = overrides.cause;
    }
    return error;
}

// ── ProcessCompressJobSuccessReturn ──────────────────────────────────────────

export type ProcessCompressJobSuccessReturnOverrides = Partial<ProcessCompressJobSuccessReturn>;

export function buildProcessCompressJobSuccessReturn(
    overrides?: ProcessCompressJobSuccessReturnOverrides,
): ProcessCompressJobSuccessReturn {
    const base: ProcessCompressJobSuccessReturn = { queued: false };
    return overrides ? { ...base, ...overrides } : base;
}

export type ProcessCompressJobSuccessReturnCorruptions = { [K in keyof ProcessCompressJobSuccessReturn]?: unknown };

export function invalidateProcessCompressJobSuccessReturn(
    corruptions: ProcessCompressJobSuccessReturnCorruptions,
): unknown {
    return { ...buildProcessCompressJobSuccessReturn(), ...corruptions };
}

// ── ProcessCompressJobErrorReturn ────────────────────────────────────────────

export type ProcessCompressJobErrorReturnOverrides = Partial<ProcessCompressJobErrorReturn>;

export function buildProcessCompressJobErrorReturn(
    overrides?: ProcessCompressJobErrorReturnOverrides,
): ProcessCompressJobErrorReturn {
    const base: ProcessCompressJobErrorReturn = {
        error: buildProcessCompressJobError(),
        retriable: false,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export type ProcessCompressJobErrorReturnCorruptions = { [K in keyof ProcessCompressJobErrorReturn]?: unknown };

export function invalidateProcessCompressJobErrorReturn(
    corruptions: ProcessCompressJobErrorReturnCorruptions,
): unknown {
    return { ...buildProcessCompressJobErrorReturn(), ...corruptions };
}

// ── ProcessCompressJobFn / BoundProcessCompressJobFn (owned functions) ───────

export const mockProcessCompressJobFn: ProcessCompressJobFn = async (
    _deps,
    _params,
    _payload,
): Promise<ProcessCompressJobReturn> => {
    return buildProcessCompressJobSuccessReturn();
};

export const mockBoundProcessCompressJobFn: BoundProcessCompressJobFn = async (
    _params,
    _payload,
): Promise<ProcessCompressJobReturn> => {
    return buildProcessCompressJobSuccessReturn();
};
