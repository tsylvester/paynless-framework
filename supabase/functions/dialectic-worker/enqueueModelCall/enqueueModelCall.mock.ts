import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import type { AiModelExtendedConfig, ApiKeyForProviderFn, ChatApiRequest } from "../../_shared/types.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import {
    createMockSupabaseClient,
} from "../../_shared/supabase.mock.ts";
import type {
    AiStreamEventBody,
    AiStreamEventData,
    BoundEnqueueModelCallFn,
    EnqueueModelCallDeps,
    EnqueueModelCallEventSizeErrorReturn,
    EnqueueModelCallFn,
    EnqueueModelCallJobRowErrorReturn,
    EnqueueModelCallParams,
    EnqueueModelCallPayload,
    EnqueueModelCallPreparationErrorReturn,
    EnqueueModelCallQueueRejectedErrorReturn,
    EnqueueModelCallQueueUnreachableErrorReturn,
    EnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.interface.ts";
import { mockComputeJobSig } from "../../_shared/utils/computeJobSig/computeJobSig.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import { buildDialecticJobRow, buildDialecticExecuteJobPayload } from "../../_shared/dialectic.mock.ts";
import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts";

export type EnqueueModelCallDepsOverrides = Partial<EnqueueModelCallDeps>;

export type EnqueueModelCallParamsOverrides = Partial<EnqueueModelCallParams>;

export type EnqueueModelCallPayloadOverrides = Partial<EnqueueModelCallPayload>;

export type EnqueueModelCallSuccessReturnOverrides = Partial<EnqueueModelCallSuccessReturn>;

export type EnqueueModelCallPreparationErrorReturnOverrides = Partial<EnqueueModelCallPreparationErrorReturn>;

export type EnqueueModelCallJobRowErrorReturnOverrides = Partial<EnqueueModelCallJobRowErrorReturn>;

export type EnqueueModelCallEventSizeErrorReturnOverrides = Partial<EnqueueModelCallEventSizeErrorReturn>;

export type EnqueueModelCallQueueRejectedErrorReturnOverrides = Partial<EnqueueModelCallQueueRejectedErrorReturn>;

export type EnqueueModelCallQueueUnreachableErrorReturnOverrides = Partial<EnqueueModelCallQueueUnreachableErrorReturn>;

export type AiStreamEventDataOverrides = Partial<AiStreamEventData>;

export type AiStreamEventBodyOverrides = Partial<AiStreamEventBody>;

export type EnqueueModelCallDepsCorruptions = {
    [K in keyof EnqueueModelCallDeps]?: unknown;
};

export type EnqueueModelCallParamsCorruptions = {
    [K in keyof EnqueueModelCallParams]?: unknown;
};

export type EnqueueModelCallPayloadCorruptions = {
    [K in keyof EnqueueModelCallPayload]?: unknown;
};

export type EnqueueModelCallSuccessReturnCorruptions = {
    [K in keyof EnqueueModelCallSuccessReturn]?: unknown;
};

export type EnqueueModelCallPreparationErrorReturnCorruptions = {
    [K in keyof EnqueueModelCallPreparationErrorReturn]?: unknown;
};

export type EnqueueModelCallJobRowErrorReturnCorruptions = {
    [K in keyof EnqueueModelCallJobRowErrorReturn]?: unknown;
};

export type EnqueueModelCallEventSizeErrorReturnCorruptions = {
    [K in keyof EnqueueModelCallEventSizeErrorReturn]?: unknown;
};

export type EnqueueModelCallQueueRejectedErrorReturnCorruptions = {
    [K in keyof EnqueueModelCallQueueRejectedErrorReturn]?: unknown;
};

export type EnqueueModelCallQueueUnreachableErrorReturnCorruptions = {
    [K in keyof EnqueueModelCallQueueUnreachableErrorReturn]?: unknown;
};

export type AiStreamEventDataCorruptions = {
    [K in keyof AiStreamEventData]?: unknown;
};

export type AiStreamEventBodyCorruptions = {
    [K in keyof AiStreamEventBody]?: unknown;
};

const defaultNetlifyQueueUrl: string =
    "https://test.netlify/.netlify/functions/async-workloads-router";

const defaultNetlifyApiKey: string = "test-awl-api-key";

const defaultApiKeyForProvider: ApiKeyForProviderFn = (
    _apiIdentifier: string,
): string | null => {
    return "mock-provider-api-key";
};

export function buildEnqueueModelCallDeps(
    overrides?: EnqueueModelCallDepsOverrides,
): EnqueueModelCallDeps {
    const logger: MockLogger = new MockLogger();
    const base: EnqueueModelCallDeps = {
        logger,
        netlifyQueueUrl: defaultNetlifyQueueUrl,
        netlifyApiKey: defaultNetlifyApiKey,
        apiKeyForProvider: defaultApiKeyForProvider,
        computeJobSig: mockComputeJobSig,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallDeps(
    corruptions: EnqueueModelCallDepsCorruptions,
): unknown {
    return { ...buildEnqueueModelCallDeps(), ...corruptions };
}

export function buildEnqueueModelCallParams(
    overrides?: EnqueueModelCallParamsOverrides,
): EnqueueModelCallParams {
    const mockSetup: ReturnType<typeof createMockSupabaseClient> =
        createMockSupabaseClient("enqueue-model-call-mock");
    const dbClient: SupabaseClient<Database> =
        mockSetup.client as unknown as SupabaseClient<Database>;
    const base: EnqueueModelCallParams = {
        dbClient,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallParams(
    corruptions: EnqueueModelCallParamsCorruptions,
): unknown {
    return { ...buildEnqueueModelCallParams(), ...corruptions };
}

export function buildEnqueueModelCallPayload(
    overrides?: EnqueueModelCallPayloadOverrides,
): EnqueueModelCallPayload {
    const testPayload = buildDialecticExecuteJobPayload();
    if (!isJson(testPayload)) {
        throw new Error("Payload must be json compatible");
    }
    if (!testPayload) {
        throw new Error("Payload must exist");
    }
    const base: EnqueueModelCallPayload = {
        job: buildDialecticJobRow({ payload: testPayload }),
        providerRow: buildMockProvider(),
        userConfig: { tier_output_cap_tokens: null },
        chatApiRequest: {
            message: "mock-message",
            providerId: "00000000-0000-4000-8000-000000000001",
            promptId: "__none__",
        },
        preflightInputTokens: 0,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallPayload(
    corruptions: EnqueueModelCallPayloadCorruptions,
): unknown {
    return { ...buildEnqueueModelCallPayload(), ...corruptions };
}

export function buildEnqueueModelCallSuccessReturn(
    overrides?: EnqueueModelCallSuccessReturnOverrides,
): EnqueueModelCallSuccessReturn {
    const base: EnqueueModelCallSuccessReturn = {
        queued: true,
        jobId: "mock-job-id",
        sig: "mock-sig",
        preflightInputTokens: 0,
        eventBodyBytes: 0,
        queueStatus: 200,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallSuccessReturn(
    corruptions: EnqueueModelCallSuccessReturnCorruptions,
): unknown {
    return { ...buildEnqueueModelCallSuccessReturn(), ...corruptions };
}

export function buildEnqueueModelCallPreparationErrorReturn(
    overrides?: EnqueueModelCallPreparationErrorReturnOverrides,
): EnqueueModelCallPreparationErrorReturn {
    const base: EnqueueModelCallPreparationErrorReturn = {
        failure: "provider_config_invalid",
        error: new Error("mock-preparation-error"),
        retriable: false,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallPreparationErrorReturn(
    corruptions: EnqueueModelCallPreparationErrorReturnCorruptions,
): unknown {
    return { ...buildEnqueueModelCallPreparationErrorReturn(), ...corruptions };
}

export function buildEnqueueModelCallJobRowErrorReturn(
    overrides?: EnqueueModelCallJobRowErrorReturnOverrides,
): EnqueueModelCallJobRowErrorReturn {
    const base: EnqueueModelCallJobRowErrorReturn = {
        failure: "job_row_update_failed",
        error: new Error("mock-job-row-error"),
        retriable: true,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallJobRowErrorReturn(
    corruptions: EnqueueModelCallJobRowErrorReturnCorruptions,
): unknown {
    return { ...buildEnqueueModelCallJobRowErrorReturn(), ...corruptions };
}

export function buildEnqueueModelCallEventSizeErrorReturn(
    overrides?: EnqueueModelCallEventSizeErrorReturnOverrides,
): EnqueueModelCallEventSizeErrorReturn {
    const base: EnqueueModelCallEventSizeErrorReturn = {
        failure: "event_body_too_large",
        error: new Error("mock-event-size-error"),
        retriable: false,
        eventBodyBytes: 600000,
        limitBytes: 512000,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallEventSizeErrorReturn(
    corruptions: EnqueueModelCallEventSizeErrorReturnCorruptions,
): unknown {
    return { ...buildEnqueueModelCallEventSizeErrorReturn(), ...corruptions };
}

export function buildEnqueueModelCallQueueRejectedErrorReturn(
    overrides?: EnqueueModelCallQueueRejectedErrorReturnOverrides,
): EnqueueModelCallQueueRejectedErrorReturn {
    const base: EnqueueModelCallQueueRejectedErrorReturn = {
        failure: "queue_rejected",
        error: new Error("mock-queue-rejected-error"),
        retriable: true,
        queueStatus: 503,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallQueueRejectedErrorReturn(
    corruptions: EnqueueModelCallQueueRejectedErrorReturnCorruptions,
): unknown {
    return { ...buildEnqueueModelCallQueueRejectedErrorReturn(), ...corruptions };
}

export function buildEnqueueModelCallQueueUnreachableErrorReturn(
    overrides?: EnqueueModelCallQueueUnreachableErrorReturnOverrides,
): EnqueueModelCallQueueUnreachableErrorReturn {
    const base: EnqueueModelCallQueueUnreachableErrorReturn = {
        failure: "queue_unreachable",
        error: new Error("mock-queue-unreachable-error"),
        retriable: true,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallQueueUnreachableErrorReturn(
    corruptions: EnqueueModelCallQueueUnreachableErrorReturnCorruptions,
): unknown {
    return { ...buildEnqueueModelCallQueueUnreachableErrorReturn(), ...corruptions };
}

const defaultAiStreamEventModelConfig: AiModelExtendedConfig = {
    api_identifier: "mock-ai-v1",
    input_token_cost_rate: 0.001,
    output_token_cost_rate: 0.002,
    tokenization_strategy: { type: "rough_char_count" },
    context_window_tokens: 10000,
    provider_max_input_tokens: 100,
    provider_max_output_tokens: 50,
};

const defaultAiStreamEventChatApiRequest: ChatApiRequest = {
    message: "mock-message",
    providerId: "00000000-0000-4000-8000-000000000001",
    promptId: "__none__",
};

export function buildAiStreamEventData(
    overrides?: AiStreamEventDataOverrides,
): AiStreamEventData {
    const base: AiStreamEventData = {
        job_id: "mock-job-id",
        api_identifier: "mock-ai-v1",
        model_config: defaultAiStreamEventModelConfig,
        chat_api_request: defaultAiStreamEventChatApiRequest,
        sig: "mock-sig",
        user_config: { tier_output_cap_tokens: null },
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateAiStreamEventData(
    corruptions: AiStreamEventDataCorruptions,
): unknown {
    return { ...buildAiStreamEventData(), ...corruptions };
}

export function buildAiStreamEventBody(
    overrides?: AiStreamEventBodyOverrides,
): AiStreamEventBody {
    const base: AiStreamEventBody = {
        eventName: "ai-stream-background",
        data: buildAiStreamEventData(),
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateAiStreamEventBody(
    corruptions: AiStreamEventBodyCorruptions,
): unknown {
    return { ...buildAiStreamEventBody(), ...corruptions };
}

export const mockEnqueueModelCall: EnqueueModelCallFn = async (
    _deps: EnqueueModelCallDeps,
    _params: EnqueueModelCallParams,
    _payload: EnqueueModelCallPayload,
): Promise<EnqueueModelCallSuccessReturn> => {
    return buildEnqueueModelCallSuccessReturn();
};

export const mockBoundEnqueueModelCall: BoundEnqueueModelCallFn = async (
    _params: EnqueueModelCallParams,
    _payload: EnqueueModelCallPayload,
): Promise<EnqueueModelCallSuccessReturn> => {
    return buildEnqueueModelCallSuccessReturn();
};
