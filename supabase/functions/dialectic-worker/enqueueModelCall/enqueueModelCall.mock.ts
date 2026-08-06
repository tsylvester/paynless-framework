import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Tables } from "../../types_db.ts";
import type { AiModelExtendedConfig, ApiKeyForProviderFn, ChatApiRequest } from "../../_shared/types.ts";
import { MockLogger } from "../../_shared/logger.mock.ts";
import {
    createMockSupabaseClient,
    type MockSupabaseClientSetup,
} from "../../_shared/supabase.mock.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";
import {
    createMockDialecticExecuteJobPayload,
    createMockJobRow,
} from "../saveResponse/saveResponse.mock.ts";
import type {
    AiStreamEventBody,
    AiStreamEventData,
    BoundEnqueueModelCallFn,
    EnqueueModelCallDeps,
    EnqueueModelCallErrorReturn,
    EnqueueModelCallFn,
    EnqueueModelCallParams,
    EnqueueModelCallPayload,
    EnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.interface.ts";
import { mockComputeJobSig } from "../../_shared/utils/computeJobSig/computeJobSig.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";

function createDefaultEnqueueJobRow(): DialecticJobRow {
    const job: DialecticJobRow = createMockJobRow(
        createMockDialecticExecuteJobPayload(),
    );
    return job;
}

export type EnqueueModelCallDepsOverrides = Partial<EnqueueModelCallDeps>;

export type EnqueueModelCallParamsOverrides = Partial<EnqueueModelCallParams>;

export type EnqueueModelCallPayloadOverrides = Partial<EnqueueModelCallPayload>;

export type EnqueueModelCallSuccessReturnOverrides = Partial<EnqueueModelCallSuccessReturn>;

export type EnqueueModelCallErrorReturnOverrides = Partial<EnqueueModelCallErrorReturn>;

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

export type EnqueueModelCallErrorReturnCorruptions = {
    [K in keyof EnqueueModelCallErrorReturn]?: unknown;
};

export type AiStreamEventDataCorruptions = {
    [K in keyof AiStreamEventData]?: unknown;
};

export type AiStreamEventBodyCorruptions = {
    [K in keyof AiStreamEventBody]?: unknown;
};

export type CreateMockEnqueueModelCallParamsOptions = {
    dbClient?: SupabaseClient<Database>;
    supabaseUserId?: string;
    supabaseConfig?: Parameters<typeof createMockSupabaseClient>[1];
    mockSetup?: MockSupabaseClientSetup;
};

const defaultNetlifyQueueUrl: string =
    "https://test.netlify/.netlify/functions/async-workloads-router";

const defaultNetlifyApiKey: string = "test-awl-api-key";

const defaultApiKeyForProvider: ApiKeyForProviderFn = (
    _apiIdentifier: string,
): string | null => {
    return "mock-provider-api-key";
};

export function createMockEnqueueModelCallDeps(
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
    return { ...createMockEnqueueModelCallDeps(), ...corruptions };
}

export function createMockEnqueueModelCallParams(
    overrides?: EnqueueModelCallParamsOverrides,
    options?: CreateMockEnqueueModelCallParamsOptions,
): EnqueueModelCallParams {
    let dbClient: SupabaseClient<Database>;
    if (options?.mockSetup !== undefined) {
        dbClient =
            options.mockSetup.client as unknown as SupabaseClient<Database>;
    } else if (options?.dbClient !== undefined) {
        dbClient = options.dbClient;
    } else if (options?.supabaseConfig !== undefined) {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> =
            createMockSupabaseClient(
                options.supabaseUserId,
                options.supabaseConfig,
            );
        dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    } else {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> =
            createMockSupabaseClient("enqueue-model-call-mock");
        dbClient = mockSetup.client as unknown as SupabaseClient<Database>;
    }

    const base: EnqueueModelCallParams = {
        dbClient,
        job: createDefaultEnqueueJobRow(),
        providerRow: buildMockProvider(),
        userAuthToken: "mock-user-jwt",
        output_type: FileType.HeaderContext,
        userConfig: { tier_output_cap_tokens: null },
    };

    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallParams(
    corruptions: EnqueueModelCallParamsCorruptions,
): unknown {
    return { ...createMockEnqueueModelCallParams(), ...corruptions };
}

export function createMockEnqueueModelCallPayload(
    overrides?: EnqueueModelCallPayloadOverrides,
): EnqueueModelCallPayload {
    const base: EnqueueModelCallPayload = {
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
    return { ...createMockEnqueueModelCallPayload(), ...corruptions };
}

export function createMockEnqueueModelCallSuccessReturn(
    overrides?: EnqueueModelCallSuccessReturnOverrides,
): EnqueueModelCallSuccessReturn {
    const base: EnqueueModelCallSuccessReturn = { queued: true };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallSuccessReturn(
    corruptions: EnqueueModelCallSuccessReturnCorruptions,
): unknown {
    return { ...createMockEnqueueModelCallSuccessReturn(), ...corruptions };
}

export function createMockEnqueueModelCallErrorReturn(
    overrides?: EnqueueModelCallErrorReturnOverrides,
): EnqueueModelCallErrorReturn {
    const base: EnqueueModelCallErrorReturn = {
        error: new Error("mock-enqueue-model-call-error"),
        retriable: false,
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateEnqueueModelCallErrorReturn(
    corruptions: EnqueueModelCallErrorReturnCorruptions,
): unknown {
    return { ...createMockEnqueueModelCallErrorReturn(), ...corruptions };
}

export type AiStreamEventDataOverrides = Partial<AiStreamEventData>;

export type AiStreamEventBodyOverrides = Partial<AiStreamEventBody>;

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

export function createMockAiStreamEventData(
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
    return { ...createMockAiStreamEventData(), ...corruptions };
}

export function createMockAiStreamEventBody(
    overrides?: AiStreamEventBodyOverrides,
): AiStreamEventBody {
    const base: AiStreamEventBody = {
        eventName: "ai-stream-background",
        data: createMockAiStreamEventData(),
    };
    return overrides ? { ...base, ...overrides } : base;
}

export function invalidateAiStreamEventBody(
    corruptions: AiStreamEventBodyCorruptions,
): unknown {
    return { ...createMockAiStreamEventBody(), ...corruptions };
}

export const mockEnqueueModelCallFn: EnqueueModelCallFn = async (
    _deps: EnqueueModelCallDeps,
    _params: EnqueueModelCallParams,
    _payload: EnqueueModelCallPayload,
): Promise<EnqueueModelCallSuccessReturn | EnqueueModelCallErrorReturn> => {
    return createMockEnqueueModelCallSuccessReturn();
};

export const mockBoundEnqueueModelCallFn: BoundEnqueueModelCallFn = async (
    _params: EnqueueModelCallParams,
    _payload: EnqueueModelCallPayload,
): Promise<EnqueueModelCallSuccessReturn | EnqueueModelCallErrorReturn> => {
    return createMockEnqueueModelCallSuccessReturn();
};
