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
    EnqueueModelCallDeps,
    EnqueueModelCallErrorReturn,
    EnqueueModelCallParams,
    EnqueueModelCallPayload,
    EnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.interface.ts";
import { mockComputeJobSig } from "../../_shared/utils/computeJobSig/computeJobSig.mock.ts";
function createDefaultEnqueueAiProviderRow(): Tables<"ai_providers"> {
    const row: Tables<"ai_providers"> = {
        id: "model-def",
        provider: "mock-provider",
        name: "Mock AI",
        api_identifier: "mock-ai-v1",
        config: {
            tokenization_strategy: {
                type: "rough_char_count",
            },
            context_window_tokens: 10000,
            input_token_cost_rate: 0.001,
            output_token_cost_rate: 0.002,
            provider_max_input_tokens: 100,
            provider_max_output_tokens: 50,
            api_identifier: "mock-ai-v1",
        },
        created_at: new Date().toISOString(),
        description: null,
        is_active: true,
        is_enabled: true,
        is_default_embedding: false,
        is_default_generation: false,
        updated_at: new Date().toISOString(),
    };
    return row;
}

function createDefaultEnqueueJobRow(): DialecticJobRow {
    const job: DialecticJobRow = createMockJobRow(
        createMockDialecticExecuteJobPayload(),
    );
    return job;
}

export type EnqueueModelCallDepsOverrides = {
    [K in keyof EnqueueModelCallDeps]?: EnqueueModelCallDeps[K] | null;
};

export type EnqueueModelCallParamsOverrides = {
    [K in keyof EnqueueModelCallParams]?: EnqueueModelCallParams[K] | null;
};

export type EnqueueModelCallPayloadOverrides = {
    [K in keyof EnqueueModelCallPayload]?: EnqueueModelCallPayload[K] | null;
};

export type EnqueueModelCallSuccessReturnOverrides = {
    [K in keyof EnqueueModelCallSuccessReturn]?:
        | EnqueueModelCallSuccessReturn[K]
        | null;
};

export type EnqueueModelCallErrorReturnOverrides = {
    [K in keyof EnqueueModelCallErrorReturn]?:
        | EnqueueModelCallErrorReturn[K]
        | null;
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
    if (!overrides) {
        return base;
    }
    return {
        logger: overrides.logger !== undefined && overrides.logger !== null
            ? overrides.logger
            : base.logger,
        netlifyQueueUrl:
            overrides.netlifyQueueUrl !== undefined &&
                overrides.netlifyQueueUrl !== null
            ? overrides.netlifyQueueUrl
            : base.netlifyQueueUrl,
        netlifyApiKey:
            overrides.netlifyApiKey !== undefined &&
                overrides.netlifyApiKey !== null
            ? overrides.netlifyApiKey
            : base.netlifyApiKey,
        apiKeyForProvider:
            overrides.apiKeyForProvider !== undefined &&
                overrides.apiKeyForProvider !== null
            ? overrides.apiKeyForProvider
            : base.apiKeyForProvider,
        computeJobSig:
            overrides.computeJobSig !== undefined &&
                overrides.computeJobSig !== null
            ? overrides.computeJobSig
            : base.computeJobSig,
    };
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
        providerRow: createDefaultEnqueueAiProviderRow(),
        userAuthToken: "mock-user-jwt",
        output_type: FileType.HeaderContext,
    };

    if (!overrides) {
        return base;
    }

    return {
        dbClient: overrides.dbClient !== undefined && overrides.dbClient !== null
            ? overrides.dbClient
            : base.dbClient,
        job: overrides.job !== undefined && overrides.job !== null
            ? overrides.job
            : base.job,
        providerRow:
            overrides.providerRow !== undefined && overrides.providerRow !== null
            ? overrides.providerRow
            : base.providerRow,
        userAuthToken:
            overrides.userAuthToken !== undefined &&
                overrides.userAuthToken !== null
            ? overrides.userAuthToken
            : base.userAuthToken,
        output_type:
            overrides.output_type !== undefined && overrides.output_type !== null
            ? overrides.output_type
            : base.output_type,
    };
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
    if (!overrides) {
        return base;
    }
    return {
        chatApiRequest:
            overrides.chatApiRequest !== undefined &&
                overrides.chatApiRequest !== null
            ? overrides.chatApiRequest
            : base.chatApiRequest,
        preflightInputTokens:
            overrides.preflightInputTokens !== undefined &&
                overrides.preflightInputTokens !== null
            ? overrides.preflightInputTokens
            : base.preflightInputTokens,
    };
}

export function createMockEnqueueModelCallSuccessReturn(
    overrides?: EnqueueModelCallSuccessReturnOverrides,
): EnqueueModelCallSuccessReturn {
    const base: EnqueueModelCallSuccessReturn = { queued: true };
    if (!overrides) {
        return base;
    }
    return {
        queued: overrides.queued !== undefined && overrides.queued !== null
            ? overrides.queued
            : base.queued,
    };
}

export function createMockEnqueueModelCallErrorReturn(
    overrides?: EnqueueModelCallErrorReturnOverrides,
): EnqueueModelCallErrorReturn {
    const base: EnqueueModelCallErrorReturn = {
        error: new Error("mock-enqueue-model-call-error"),
        retriable: false,
    };
    if (!overrides) {
        return base;
    }
    return {
        error: overrides.error !== undefined && overrides.error !== null
            ? overrides.error
            : base.error,
        retriable:
            overrides.retriable !== undefined && overrides.retriable !== null
            ? overrides.retriable
            : base.retriable,
    };
}

export type AiStreamEventDataOverrides = {
    [K in keyof AiStreamEventData]?: AiStreamEventData[K] | null;
};

export type AiStreamEventBodyOverrides = {
    [K in keyof AiStreamEventBody]?: AiStreamEventBody[K] | null;
};

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
    };
    if (!overrides) {
        return base;
    }
    return {
        job_id: overrides.job_id !== undefined && overrides.job_id !== null
            ? overrides.job_id
            : base.job_id,
        api_identifier:
            overrides.api_identifier !== undefined &&
                overrides.api_identifier !== null
            ? overrides.api_identifier
            : base.api_identifier,
        model_config:
            overrides.model_config !== undefined &&
                overrides.model_config !== null
            ? overrides.model_config
            : base.model_config,
        chat_api_request:
            overrides.chat_api_request !== undefined &&
                overrides.chat_api_request !== null
            ? overrides.chat_api_request
            : base.chat_api_request,
        sig: overrides.sig !== undefined && overrides.sig !== null
            ? overrides.sig
            : base.sig,
    };
}

export function createMockAiStreamEventBody(
    overrides?: AiStreamEventBodyOverrides,
): AiStreamEventBody {
    const base: AiStreamEventBody = {
        eventName: "ai-stream",
        data: createMockAiStreamEventData(),
    };
    if (!overrides) {
        return base;
    }
    return {
        eventName: "ai-stream",
        data: overrides.data !== undefined && overrides.data !== null
            ? overrides.data
            : base.data,
    };
}
