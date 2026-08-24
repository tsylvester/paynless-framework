import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type { Database } from "../../types_db.ts";
import { mockBoundRetryJobFn } from "../retryJob/retryJob.provides.ts";
import { mockBoundLoadJobContextFn } from "../loadJobContext/loadJobContext.provides.ts";
import { mockBoundAssembleAiResponseFn } from "../assembleAiResponse/assembleAiResponse.provides.ts";
import { mockBoundDebitForResponseFn } from "../debitForResponse/debitForResponse.provides.ts";
import { mockBoundPrepareResponseContentFn } from "../prepareResponseContent/prepareResponseContent.provides.ts";
import { mockBoundSaveContributionResponseFn } from "../saveContributionResponse/saveContributionResponse.provides.ts";
import { mockBoundSaveCompressedResponseFn } from "../saveCompressedResponse/saveCompressedResponse.provides.ts";
import type {
    BoundSaveResponseFn,
    NodeTokenUsage,
    SaveResponseDeps,
    SaveResponseErrorReturn,
    SaveResponseFn,
    SaveResponseParams,
    SaveResponsePayload,
    SaveResponseRequestBody,
    SaveResponseSuccessReturn,
} from "./saveResponse.interface.ts";

/* ------------------------------------------------------------------ */
/*  Owned object types — canonical four symbols each                  */
/* ------------------------------------------------------------------ */

export type NodeTokenUsageOverrides = Partial<NodeTokenUsage>;
export type NodeTokenUsageCorruptions = { [K in keyof NodeTokenUsage]?: unknown };

export function buildNodeTokenUsage(overrides?: NodeTokenUsageOverrides): NodeTokenUsage {
    const base: NodeTokenUsage = {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateNodeTokenUsage(corruptions: NodeTokenUsageCorruptions): unknown {
    return { ...buildNodeTokenUsage(), ...corruptions };
}

export type SaveResponseParamsOverrides = Partial<SaveResponseParams>;
export type SaveResponseParamsCorruptions = { [K in keyof SaveResponseParams]?: unknown };

export function buildSaveResponseParams(overrides?: SaveResponseParamsOverrides): SaveResponseParams {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> =
        createMockSupabaseClient("save-response-mock-params");
    const dbClient: SupabaseClient<Database> =
        mockSetup.client as unknown as SupabaseClient<Database>;
    const base: SaveResponseParams = {
        job_id: "mock-job-id",
        dbClient,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateSaveResponseParams(corruptions: SaveResponseParamsCorruptions): unknown {
    return { ...buildSaveResponseParams(), ...corruptions };
}

export type SaveResponsePayloadOverrides = Partial<SaveResponsePayload>;
export type SaveResponsePayloadCorruptions = { [K in keyof SaveResponsePayload]?: unknown };

export function buildSaveResponsePayload(overrides?: SaveResponsePayloadOverrides): SaveResponsePayload {
    const base: SaveResponsePayload = {
        assembled_content: "{}",
        token_usage: buildNodeTokenUsage(),
        finish_reason: null,
        processingTimeMs: 0,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateSaveResponsePayload(corruptions: SaveResponsePayloadCorruptions): unknown {
    return { ...buildSaveResponsePayload(), ...corruptions };
}

export type SaveResponseRequestBodyOverrides = Partial<SaveResponseRequestBody>;
export type SaveResponseRequestBodyCorruptions = { [K in keyof SaveResponseRequestBody]?: unknown };

export function buildSaveResponseRequestBody(overrides?: SaveResponseRequestBodyOverrides): SaveResponseRequestBody {
    const base: SaveResponseRequestBody = {
        job_id: "mock-job-id",
        assembled_content: "{}",
        token_usage: buildNodeTokenUsage(),
        finish_reason: null,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateSaveResponseRequestBody(corruptions: SaveResponseRequestBodyCorruptions): unknown {
    return { ...buildSaveResponseRequestBody(), ...corruptions };
}

export type SaveResponseDepsOverrides = Partial<SaveResponseDeps>;
export type SaveResponseDepsCorruptions = { [K in keyof SaveResponseDeps]?: unknown };

export function buildSaveResponseDeps(overrides?: SaveResponseDepsOverrides): SaveResponseDeps {
    const base: SaveResponseDeps = {
        logger: new MockLogger(),
        retryJob: mockBoundRetryJobFn,
        loadJobContext: mockBoundLoadJobContextFn,
        assembleAiResponse: mockBoundAssembleAiResponseFn,
        debitForResponse: mockBoundDebitForResponseFn,
        prepareResponseContent: mockBoundPrepareResponseContentFn,
        saveContributionResponse: mockBoundSaveContributionResponseFn,
        saveCompressedResponse: mockBoundSaveCompressedResponseFn,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateSaveResponseDeps(corruptions: SaveResponseDepsCorruptions): unknown {
    return { ...buildSaveResponseDeps(), ...corruptions };
}

export type SaveResponseSuccessReturnOverrides = Partial<SaveResponseSuccessReturn>;
export type SaveResponseSuccessReturnCorruptions = { [K in keyof SaveResponseSuccessReturn]?: unknown };

export function buildSaveResponseSuccessReturn(overrides?: SaveResponseSuccessReturnOverrides): SaveResponseSuccessReturn {
    const base: SaveResponseSuccessReturn = { status: "completed" };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateSaveResponseSuccessReturn(corruptions: SaveResponseSuccessReturnCorruptions): unknown {
    return { ...buildSaveResponseSuccessReturn(), ...corruptions };
}

export type SaveResponseErrorReturnOverrides = Partial<SaveResponseErrorReturn>;
export type SaveResponseErrorReturnCorruptions = { [K in keyof SaveResponseErrorReturn]?: unknown };

export function buildSaveResponseErrorReturn(overrides?: SaveResponseErrorReturnOverrides): SaveResponseErrorReturn {
    const base: SaveResponseErrorReturn = {
        error: new Error("mock-save-response-error"),
        retriable: false,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateSaveResponseErrorReturn(corruptions: SaveResponseErrorReturnCorruptions): unknown {
    return { ...buildSaveResponseErrorReturn(), ...corruptions };
}

/* ------------------------------------------------------------------ */
/*  Function mock                                                     */
/* ------------------------------------------------------------------ */

export const mockSaveResponseFn: SaveResponseFn = async (_deps, _params, _payload) => {
    return buildSaveResponseSuccessReturn();
};

export const mockBoundSaveResponseFn: BoundSaveResponseFn = async (_params, _payload) => {
    return buildSaveResponseSuccessReturn();
};
