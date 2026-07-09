import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    AiWorkloadEmbeddingEvent,
    AiWorkloadEvent,
    AiWorkloadStreamEvent,
    EnqueueModelCallDeps,
    EnqueueModelCallEmbeddingPayload,
    EnqueueModelCallStreamPayload,
} from "./enqueueModelCall.interface.ts";
import {
    createMockEnqueueModelCallDeps,
    createMockEnqueueModelCallErrorReturn,
    createMockEnqueueModelCallParams,
    createMockEnqueueModelCallPayload,
    createMockEnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.mock.ts";
import {
    isAiStreamEventBody,
    isAiStreamEventData,
    isEnqueueModelCallDeps,
    isEnqueueModelCallErrorReturn,
    isEnqueueModelCallParams,
    isEnqueueModelCallPayload,
    isEnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.guard.ts";

Deno.test(
    "Type Guard: isEnqueueModelCallDeps returns true for full mock deps",
    () => {
        const deps: EnqueueModelCallDeps = createMockEnqueueModelCallDeps();
        assertEquals(isEnqueueModelCallDeps(deps), true);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallDeps returns false when logger is missing",
    () => {
        const full: EnqueueModelCallDeps = createMockEnqueueModelCallDeps();
        assertEquals(
            isEnqueueModelCallDeps({
                netlifyQueueUrl: full.netlifyQueueUrl,
                netlifyApiKey: full.netlifyApiKey,
                apiKeyForProvider: full.apiKeyForProvider,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallDeps returns false when netlifyQueueUrl is missing",
    () => {
        const full: EnqueueModelCallDeps = createMockEnqueueModelCallDeps();
        assertEquals(
            isEnqueueModelCallDeps({
                logger: full.logger,
                netlifyApiKey: full.netlifyApiKey,
                apiKeyForProvider: full.apiKeyForProvider,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallDeps returns false when netlifyApiKey is missing",
    () => {
        const full: EnqueueModelCallDeps = createMockEnqueueModelCallDeps();
        assertEquals(
            isEnqueueModelCallDeps({
                logger: full.logger,
                netlifyQueueUrl: full.netlifyQueueUrl,
                apiKeyForProvider: full.apiKeyForProvider,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallDeps returns false when apiKeyForProvider is missing",
    () => {
        const full: EnqueueModelCallDeps = createMockEnqueueModelCallDeps();
        assertEquals(
            isEnqueueModelCallDeps({
                logger: full.logger,
                netlifyQueueUrl: full.netlifyQueueUrl,
                netlifyApiKey: full.netlifyApiKey,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallDeps returns false for null and non-record roots",
    () => {
        assertEquals(isEnqueueModelCallDeps(null), false);
        assertEquals(isEnqueueModelCallDeps(0), false);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallParams returns true for full mock params",
    () => {
        assertEquals(
            isEnqueueModelCallParams(createMockEnqueueModelCallParams()),
            true,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallParams returns false when dbClient is missing",
    () => {
        const full = createMockEnqueueModelCallParams();
        assertEquals(
            isEnqueueModelCallParams({
                job: full.job,
                providerRow: full.providerRow,
                userAuthToken: full.userAuthToken,
                output_type: full.output_type,
                userConfig: { tier_output_cap_tokens: null },
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallParams returns false when job is missing",
    () => {
        const full = createMockEnqueueModelCallParams();
        assertEquals(
            isEnqueueModelCallParams({
                dbClient: full.dbClient,
                providerRow: full.providerRow,
                userAuthToken: full.userAuthToken,
                output_type: full.output_type,
                userConfig: { tier_output_cap_tokens: null },
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallParams returns false when providerRow is missing",
    () => {
        const full = createMockEnqueueModelCallParams();
        assertEquals(
            isEnqueueModelCallParams({
                dbClient: full.dbClient,
                job: full.job,
                userAuthToken: full.userAuthToken,
                output_type: full.output_type,
                userConfig: { tier_output_cap_tokens: null },
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallParams returns false when userAuthToken is missing",
    () => {
        const full = createMockEnqueueModelCallParams();
        assertEquals(
            isEnqueueModelCallParams({
                dbClient: full.dbClient,
                job: full.job,
                providerRow: full.providerRow,
                output_type: full.output_type,
                userConfig: { tier_output_cap_tokens: null },
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallParams returns false when output_type is missing",
    () => {
        const full = createMockEnqueueModelCallParams();
        assertEquals(
            isEnqueueModelCallParams({
                dbClient: full.dbClient,
                job: full.job,
                providerRow: full.providerRow,
                userAuthToken: full.userAuthToken,
                userConfig: { tier_output_cap_tokens: null },
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallParams returns false for null and non-record roots",
    () => {
        assertEquals(isEnqueueModelCallParams(null), false);
        assertEquals(isEnqueueModelCallParams("x"), false);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallPayload accepts valid stream payload variant",
    () => {
        assertEquals(
            isEnqueueModelCallPayload(createMockEnqueueModelCallPayload()),
            true,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallPayload accepts valid embedding payload variant",
    () => {
        const payload: EnqueueModelCallEmbeddingPayload = {
            operation: "embedding",
            embeddingApiRequest: {
                input: "embed this",
            },
            preflightInputTokens: 42,
        };
        assertEquals(isEnqueueModelCallPayload(payload), true);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallPayload rejects mixed stream and embedding fields in a single variant",
    () => {
        assertEquals(
            isEnqueueModelCallPayload({
                operation: "stream",
                chatApiRequest: {
                    message: "m",
                    providerId: "p",
                    promptId: "q",
                },
                embeddingApiRequest: {
                    input: "embed this",
                },
                preflightInputTokens: 1,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallPayload rejects unknown operation discriminator",
    () => {
        assertEquals(
            isEnqueueModelCallPayload({
                operation: "unknown",
                chatApiRequest: { message: "m", providerId: "p", promptId: "q" },
                preflightInputTokens: 1,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallPayload returns false when chatApiRequest is missing",
    () => {
        const full = createMockEnqueueModelCallPayload();
        assertEquals(
            isEnqueueModelCallPayload({
                preflightInputTokens: full.preflightInputTokens,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallPayload returns false when preflightInputTokens is missing",
    () => {
        assertEquals(
            isEnqueueModelCallPayload({
                operation: "stream",
                chatApiRequest: {
                    message: "m",
                    providerId: "p",
                    promptId: "q",
                },
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallPayload returns false for null and non-record roots",
    () => {
        assertEquals(isEnqueueModelCallPayload(null), false);
        assertEquals(isEnqueueModelCallPayload([]), false);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallSuccessReturn returns true for queued true",
    () => {
        const value = createMockEnqueueModelCallSuccessReturn();
        assertEquals(isEnqueueModelCallSuccessReturn(value), true);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallSuccessReturn returns false when queued is false",
    () => {
        assertEquals(isEnqueueModelCallSuccessReturn({ queued: false }), false);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallSuccessReturn returns false when queued field is missing",
    () => {
        assertEquals(isEnqueueModelCallSuccessReturn({}), false);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallSuccessReturn returns false for null and non-record roots",
    () => {
        assertEquals(isEnqueueModelCallSuccessReturn(null), false);
        assertEquals(isEnqueueModelCallSuccessReturn("x"), false);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallErrorReturn returns true for Error and retriable boolean",
    () => {
        const value = createMockEnqueueModelCallErrorReturn({
            error: new Error("x"),
            retriable: true,
        });
        assertEquals(isEnqueueModelCallErrorReturn(value), true);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallErrorReturn returns false when retriable is missing",
    () => {
        assertEquals(
            isEnqueueModelCallErrorReturn({
                error: new Error("x"),
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallErrorReturn returns false when error is missing",
    () => {
        assertEquals(
            isEnqueueModelCallErrorReturn({
                retriable: false,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallErrorReturn returns false when retriable is not a boolean",
    () => {
        assertEquals(
            isEnqueueModelCallErrorReturn({
                error: new Error("x"),
                retriable: "yes",
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallErrorReturn returns false for null and non-record roots",
    () => {
        assertEquals(isEnqueueModelCallErrorReturn(null), false);
        assertEquals(isEnqueueModelCallErrorReturn({}), false);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData accepts valid stream event variant",
    () => {
        const streamEvent: AiWorkloadStreamEvent = {
            operation: "stream",
            job_id: "job-1",
            api_identifier: "api-id",
            model_config: {
                api_identifier: "api-id",
                tokenization_strategy: { type: "rough_char_count" },
                context_window_tokens: 10000,
                input_token_cost_rate: 0.001,
                output_token_cost_rate: 0.002,
                provider_max_input_tokens: 100,
                provider_max_output_tokens: 50,
            },
            chat_api_request: { message: "m", providerId: "p", promptId: "q" },
            sig: "mock-sig",
            user_config: { tier_output_cap_tokens: null },
        };
        assertEquals(isAiStreamEventData(streamEvent), true);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData accepts valid embedding event variant",
    () => {
        const embeddingEvent: AiWorkloadEmbeddingEvent = {
            operation: "embedding",
            job_id: "job-1",
            api_identifier: "api-id",
            model_config: {
                api_identifier: "api-id",
                tokenization_strategy: { type: "rough_char_count" },
                context_window_tokens: 10000,
                input_token_cost_rate: 0.001,
                output_token_cost_rate: 0.002,
                provider_max_input_tokens: 100,
                provider_max_output_tokens: 50,
            },
            embedding_api_request: { input: "embed this" },
            sig: "mock-sig",
            user_config: { tier_output_cap_tokens: null },
        };
        assertEquals(isAiStreamEventData(embeddingEvent), true);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData rejects mixed stream and embedding fields in a single variant",
    () => {
        assertEquals(
            isAiStreamEventData({
                operation: "stream",
                job_id: "job-1",
                api_identifier: "api-id",
                model_config: {
                    api_identifier: "api-id",
                    tokenization_strategy: { type: "rough_char_count" },
                    context_window_tokens: 10000,
                    input_token_cost_rate: 0.001,
                    output_token_cost_rate: 0.002,
                    provider_max_input_tokens: 100,
                    provider_max_output_tokens: 50,
                },
                chat_api_request: { message: "m", providerId: "p", promptId: "q" },
                embedding_api_request: { input: "embed this" },
                sig: "mock-sig",
                user_config: { tier_output_cap_tokens: null },
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData rejects unknown operation discriminator",
    () => {
        assertEquals(
            isAiStreamEventData({
                operation: "unknown",
                job_id: "job-1",
                api_identifier: "api-id",
                model_config: {
                    api_identifier: "api-id",
                    tokenization_strategy: { type: "rough_char_count" },
                    context_window_tokens: 10000,
                    input_token_cost_rate: 0.001,
                    output_token_cost_rate: 0.002,
                    provider_max_input_tokens: 100,
                    provider_max_output_tokens: 50,
                },
                chat_api_request: { message: "m", providerId: "p", promptId: "q" },
                sig: "mock-sig",
                user_config: { tier_output_cap_tokens: null },
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false for null and non-record roots",
    () => {
        assertEquals(isAiStreamEventData(null), false);
        assertEquals(isAiStreamEventData("x"), false);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventBody accepts eventName ai-stream-background",
    () => {
        const streamEvent: AiWorkloadStreamEvent = {
            operation: "stream",
            job_id: "job-1",
            api_identifier: "api-id",
            model_config: {
                api_identifier: "api-id",
                tokenization_strategy: { type: "rough_char_count" },
                context_window_tokens: 10000,
                input_token_cost_rate: 0.001,
                output_token_cost_rate: 0.002,
                provider_max_input_tokens: 100,
                provider_max_output_tokens: 50,
            },
            chat_api_request: { message: "m", providerId: "p", promptId: "q" },
            sig: "mock-sig",
            user_config: { tier_output_cap_tokens: null },
        };
        assertEquals(
            isAiStreamEventBody({
                eventName: "ai-stream-background",
                data: streamEvent,
            }),
            true,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventBody returns false when eventName is missing",
    () => {
        assertEquals(
            isAiStreamEventBody({
                data: {
                    job_id: "job-1",
                    api_identifier: "api-id",
                    model_config: { api_identifier: "api-id" },
                    chat_api_request: { message: "m", providerId: "p", promptId: "q" },
                    user_jwt: "jwt-token",
                    tier_output_cap_tokens: null,
                },
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventBody rejects stale eventName literals",
    () => {
        const streamEvent: AiWorkloadStreamEvent = {
            operation: "stream",
            job_id: "job-1",
            api_identifier: "api-id",
            model_config: {
                api_identifier: "api-id",
                tokenization_strategy: { type: "rough_char_count" },
                context_window_tokens: 10000,
                input_token_cost_rate: 0.001,
                output_token_cost_rate: 0.002,
                provider_max_input_tokens: 100,
                provider_max_output_tokens: 50,
            },
            chat_api_request: { message: "m", providerId: "p", promptId: "q" },
            sig: "mock-sig",
            user_config: { tier_output_cap_tokens: null },
        };
        assertEquals(
            isAiStreamEventBody({
                eventName: "ai-stream",
                data: streamEvent,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventBody returns false when data is missing",
    () => {
        assertEquals(
            isAiStreamEventBody({
                eventName: "ai-stream-background",
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventBody returns false for null and non-record roots",
    () => {
        assertEquals(isAiStreamEventBody(null), false);
        assertEquals(isAiStreamEventBody(0), false);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallDeps returns false when computeJobSig is missing",
    () => {
        const full: EnqueueModelCallDeps = createMockEnqueueModelCallDeps();
        assertEquals(
            isEnqueueModelCallDeps({
                logger: full.logger,
                netlifyQueueUrl: full.netlifyQueueUrl,
                netlifyApiKey: full.netlifyApiKey,
                apiKeyForProvider: full.apiKeyForProvider,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallDeps returns false when computeJobSig is not a function",
    () => {
        const full: EnqueueModelCallDeps = createMockEnqueueModelCallDeps();
        assertEquals(
            isEnqueueModelCallDeps({
                logger: full.logger,
                netlifyQueueUrl: full.netlifyQueueUrl,
                netlifyApiKey: full.netlifyApiKey,
                apiKeyForProvider: full.apiKeyForProvider,
                computeJobSig: 42,
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns true when tier_output_cap_tokens is null",
    () => {
        const streamEvent: AiWorkloadStreamEvent = {
            operation: "stream",
            job_id: "job-1",
            api_identifier: "api-id",
            model_config: {
                api_identifier: "api-id",
                tokenization_strategy: { type: "rough_char_count" },
                context_window_tokens: 10000,
                input_token_cost_rate: 0.001,
                output_token_cost_rate: 0.002,
                provider_max_input_tokens: 100,
                provider_max_output_tokens: 50,
            },
            chat_api_request: { message: "m", providerId: "p", promptId: "q" },
            sig: "mock-sig",
            user_config: { tier_output_cap_tokens: null },
        };
        assertEquals(isAiStreamEventData(streamEvent), true);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns true when tier_output_cap_tokens is 32768",
    () => {
        const streamEvent: AiWorkloadStreamEvent = {
            operation: "stream",
            job_id: "job-1",
            api_identifier: "api-id",
            model_config: {
                api_identifier: "api-id",
                tokenization_strategy: { type: "rough_char_count" },
                context_window_tokens: 10000,
                input_token_cost_rate: 0.001,
                output_token_cost_rate: 0.002,
                provider_max_input_tokens: 100,
                provider_max_output_tokens: 50,
            },
            chat_api_request: { message: "m", providerId: "p", promptId: "q" },
            sig: "mock-sig",
            user_config: { tier_output_cap_tokens: 32768 },
        };
        assertEquals(isAiStreamEventData(streamEvent), true);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when user_config.tier_output_cap_tokens is missing",
    () => {
        assertEquals(
            isAiStreamEventData({
                operation: "stream",
                job_id: "job-1",
                api_identifier: "api-id",
                model_config: {
                    api_identifier: "api-id",
                    tokenization_strategy: { type: "rough_char_count" },
                    context_window_tokens: 10000,
                    input_token_cost_rate: 0.001,
                    output_token_cost_rate: 0.002,
                    provider_max_input_tokens: 100,
                    provider_max_output_tokens: 50,
                },
                chat_api_request: { message: "m", providerId: "p", promptId: "q" },
                sig: "mock-sig",
                user_config: {},
            }),
            false,
        );
    },
);
