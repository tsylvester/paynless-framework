import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { createMockCountTokens } from "../../_shared/utils/tokenizer_utils.mock.ts";
import { constructStoragePath } from "../../_shared/utils/path_constructor.ts";
import { buildBoundAssembleCompressionPromptFn } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.mock.ts";
import { createMockEnqueueModelCallSuccessReturn } from "../enqueueModelCall/enqueueModelCall.mock.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { mockJob } from "../processSimpleJob.mock.ts";
import { buildDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import type {
    BoundEnqueueModelCallFn,
    EnqueueModelCallReturn,
} from "../enqueueModelCall/enqueueModelCall.interface.ts";
import type {
    ProcessCompressJobDeps,
    ProcessCompressJobErrorReturn,
    ProcessCompressJobFn,
    ProcessCompressJobParams,
    ProcessCompressJobPayload,
    ProcessCompressJobReturn,
    ProcessCompressJobSuccessReturn,
} from "./processCompressJob.interface.ts";

export type ProcessCompressJobDepsOverrides = {
    [K in keyof ProcessCompressJobDeps]?: ProcessCompressJobDeps[K] | null;
};

export type ProcessCompressJobParamsOverrides = {
    [K in keyof ProcessCompressJobParams]?: ProcessCompressJobParams[K] | null;
};

export type ProcessCompressJobSuccessReturnOverrides = {
    [K in keyof ProcessCompressJobSuccessReturn]?:
        | ProcessCompressJobSuccessReturn[K]
        | null;
};

export type ProcessCompressJobErrorReturnOverrides = {
    [K in keyof ProcessCompressJobErrorReturn]?:
        | ProcessCompressJobErrorReturn[K]
        | null;
};

export function createProcessCompressJobMock(options?: {
    result?: ProcessCompressJobReturn;
    handler?: ProcessCompressJobFn;
}): ProcessCompressJobFn {
    const processCompressJob: ProcessCompressJobFn = async (
        deps: ProcessCompressJobDeps,
        params: ProcessCompressJobParams,
        payload: ProcessCompressJobPayload,
    ): Promise<ProcessCompressJobReturn> => {
        if (options?.handler !== undefined) {
            return await options.handler(deps, params, payload);
        }

        if (options?.result !== undefined) {
            return options.result;
        }

        return buildProcessCompressJobSuccessReturn();
    };

    return processCompressJob;
}

export function buildProcessCompressJobDeps(
    overrides?: ProcessCompressJobDepsOverrides,
): ProcessCompressJobDeps {
    const defaultEnqueueModelCall: BoundEnqueueModelCallFn = async (
        _params,
        _payload,
    ): Promise<EnqueueModelCallReturn> => {
        return createMockEnqueueModelCallSuccessReturn();
    };

    const defaultGetEncoding = (_name: string) => ({
        encode: (input: string) => Array.from({ length: input.length }, (_, i) => i),
    });
    const defaultCountTokensAnthropic = (text: string) => text.length;

    const base: ProcessCompressJobDeps = {
        assembleCompressionPrompt: buildBoundAssembleCompressionPromptFn(),
        enqueueModelCall: defaultEnqueueModelCall,
        countTokens: createMockCountTokens(),
        getEncoding: defaultGetEncoding,
        countTokensAnthropic: defaultCountTokensAnthropic,
        constructStoragePath: constructStoragePath,
        logger: new MockLogger(),
    };

    if (!overrides) {
        return base;
    }

    return {
        assembleCompressionPrompt:
            overrides !== undefined && "assembleCompressionPrompt" in overrides
                ? overrides.assembleCompressionPrompt!
                : base.assembleCompressionPrompt,
        enqueueModelCall:
            overrides !== undefined && "enqueueModelCall" in overrides
                ? overrides.enqueueModelCall!
                : base.enqueueModelCall,
        countTokens:
            overrides !== undefined && "countTokens" in overrides
                ? overrides.countTokens!
                : base.countTokens,
        getEncoding:
            overrides !== undefined && "getEncoding" in overrides
                ? overrides.getEncoding!
                : base.getEncoding,
        countTokensAnthropic:
            overrides !== undefined && "countTokensAnthropic" in overrides
                ? overrides.countTokensAnthropic!
                : base.countTokensAnthropic,
        constructStoragePath:
            overrides !== undefined && "constructStoragePath" in overrides
                ? overrides.constructStoragePath!
                : base.constructStoragePath,
        logger:
            overrides !== undefined && "logger" in overrides
                ? overrides.logger!
                : base.logger,
    };
}

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

    if (!overrides) {
        return base;
    }

    return {
        dbClient:
            overrides !== undefined && "dbClient" in overrides
                ? overrides.dbClient!
                : base.dbClient,
        job:
            overrides !== undefined && "job" in overrides
                ? overrides.job!
                : base.job,
        projectOwnerUserId:
            overrides !== undefined && "projectOwnerUserId" in overrides
                ? overrides.projectOwnerUserId!
                : base.projectOwnerUserId,
        authToken:
            overrides !== undefined && "authToken" in overrides
                ? overrides.authToken!
                : base.authToken,
    };
}

export function buildProcessCompressJobSuccessReturn(
    overrides?: ProcessCompressJobSuccessReturnOverrides,
): ProcessCompressJobSuccessReturn {
    const base: ProcessCompressJobSuccessReturn = { queued: false };

    if (!overrides) {
        return base;
    }

    return {
        queued:
            overrides !== undefined && "queued" in overrides
                ? overrides.queued!
                : base.queued,
    };
}

export function buildProcessCompressJobErrorReturn(
    overrides?: ProcessCompressJobErrorReturnOverrides,
): ProcessCompressJobErrorReturn {
    const base: ProcessCompressJobErrorReturn = {
        error: new Error("mock-process-compress-job-error"),
        retriable: false,
    };

    if (!overrides) {
        return base;
    }

    return {
        error:
            overrides !== undefined && "error" in overrides
                ? overrides.error!
                : base.error,
        retriable:
            overrides !== undefined && "retriable" in overrides
                ? overrides.retriable!
                : base.retriable,
    };
}