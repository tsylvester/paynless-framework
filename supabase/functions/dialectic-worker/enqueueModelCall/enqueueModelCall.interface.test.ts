import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    AiWorkloadEmbeddingEvent,
    AiWorkloadEvent,
    AiWorkloadStreamEvent,
    AiStreamEventBody,
    BoundEnqueueModelCallFn,
    EnqueueModelCallDeps,
    EnqueueModelCallErrorReturn,
    EnqueueModelCallParams,
    EnqueueModelCallPayload,
    EnqueueModelCallReturn,
    EnqueueModelCallSuccessReturn,
} from "./enqueueModelCall.interface.ts";

Deno.test(
    "Contract: EnqueueModelCallDeps declares five dependency keys",
    () => {
        const surface: Record<keyof EnqueueModelCallDeps, true> = {
            logger: true,
            netlifyQueueUrl: true,
            netlifyApiKey: true,
            apiKeyForProvider: true,
            computeJobSig: true,
        };
        assertEquals(Object.keys(surface).length, 5);
    },
);

Deno.test(
    "Contract: EnqueueModelCallParams declares six fields",
    () => {
        const surface: Record<keyof EnqueueModelCallParams, true> = {
            dbClient: true,
            job: true,
            providerRow: true,
            userAuthToken: true,
            output_type: true,
            userConfig: true,
        };
        assertEquals(Object.keys(surface).length, 6);
    },
);

Deno.test(
    "Contract: EnqueueModelCallPayload stream variant includes chatApiRequest and excludes embedding-only fields",
    () => {
        const payload: EnqueueModelCallPayload = {
            operation: "stream",
            chatApiRequest: {
                message: "m",
                providerId: "00000000-0000-0000-0000-000000000001",
                promptId: "__none__",
            },
            preflightInputTokens: 50,
        };
        assertEquals(payload.operation, "stream");
        assertEquals(typeof payload.preflightInputTokens, "number");
        if (payload.operation === "stream") {
            assertEquals(typeof payload.chatApiRequest.message, "string");
            assertEquals("embeddingApiRequest" in payload, false);
        }
    },
);

Deno.test(
    "Contract: EnqueueModelCallPayload embedding variant includes embedding input and excludes stream-only fields",
    () => {
        const payload: EnqueueModelCallPayload = {
            operation: "embedding",
            embeddingApiRequest: {
                input: "embed this",
            },
            preflightInputTokens: 25,
        };
        assertEquals(payload.operation, "embedding");
        assertEquals(typeof payload.preflightInputTokens, "number");
        if (payload.operation === "embedding") {
            assertEquals(typeof payload.embeddingApiRequest.input, "string");
            assertEquals("chatApiRequest" in payload, false);
        }
    },
);

Deno.test(
    "Contract: EnqueueModelCallPayload rejects unknown operation discriminator",
    () => {
        const isAllowedOperation = (
            value: string,
        ): value is EnqueueModelCallPayload["operation"] => {
            return value === "stream" || value === "embedding";
        };
        assertEquals(isAllowedOperation("stream"), true);
        assertEquals(isAllowedOperation("embedding"), true);
        assertEquals(isAllowedOperation("unknown"), false);
    },
);

Deno.test(
    "Contract: EnqueueModelCallSuccessReturn queued true",
    () => {
        const r: EnqueueModelCallSuccessReturn = { queued: true };
        assertEquals(r.queued, true);
    },
);

Deno.test(
    "Contract: EnqueueModelCallErrorReturn has Error and retriable boolean",
    () => {
        const err: EnqueueModelCallErrorReturn = {
            error: new Error("x"),
            retriable: false,
        };
        assertEquals(err.error instanceof Error, true);
        assertEquals(typeof err.retriable, "boolean");
    },
);

Deno.test(
    "Contract: AiWorkloadEvent stream variant includes operation and chat_api_request",
    () => {
        const eventData: AiWorkloadStreamEvent = {
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
            chat_api_request: {
                message: "hello",
                providerId: "00000000-0000-0000-0000-000000000001",
                promptId: "__none__",
            },
            sig: "mock-sig",
            user_config: {
                tier_output_cap_tokens: null,
            },
        };
        assertEquals(eventData.operation, "stream");
        if (eventData.operation === "stream") {
            assertEquals(typeof eventData.chat_api_request.message, "string");
            assertEquals("embedding_api_request" in eventData, false);
        }
    },
);

Deno.test(
    "Contract: AiWorkloadEvent embedding variant includes operation and embedding_api_request",
    () => {
        const eventData: AiWorkloadEmbeddingEvent = {
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
            embedding_api_request: {
                input: "embed this",
            },
            sig: "mock-sig",
            user_config: {
                tier_output_cap_tokens: null,
            },
        };
        assertEquals(eventData.operation, "embedding");
        if (eventData.operation === "embedding") {
            assertEquals(typeof eventData.embedding_api_request.input, "string");
            assertEquals("chat_api_request" in eventData, false);
        }
    },
);

Deno.test(
    "Contract: AiWorkloadEvent preserves sig and user_config requirements",
    () => {
        const streamEventData: AiWorkloadStreamEvent = {
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
            chat_api_request: {
                message: "hello",
                providerId: "00000000-0000-0000-0000-000000000001",
                promptId: "__none__",
            },
            sig: "sig-1",
            user_config: {
                tier_output_cap_tokens: 32768,
            },
        };
        assertEquals(typeof streamEventData.sig, "string");
        assertEquals(typeof streamEventData.user_config.tier_output_cap_tokens, "number");
    },
);

Deno.test(
    "Contract: AiStreamEventBody declares eventName and data",
    () => {
        const surface: Record<keyof AiStreamEventBody, true> = {
            eventName: true,
            data: true,
        };
        assertEquals(Object.keys(surface).length, 2);
    },
);

Deno.test(
    "Contract: BoundEnqueueModelCallFn signature",
    () => {
        const bound: BoundEnqueueModelCallFn = async (
            _params: EnqueueModelCallParams,
            _payload: EnqueueModelCallPayload,
        ): Promise<EnqueueModelCallReturn> => {
            const ok: EnqueueModelCallSuccessReturn = { queued: true };
            return ok;
        };
        assertEquals(typeof bound, "function");
    },
);

Deno.test(
    "Contract: EnqueueModelCallDeps computeJobSig is typed as a function",
    () => {
        const fn: EnqueueModelCallDeps["computeJobSig"] = async (
            _jobId: string,
            _userId: string,
            _createdAt: string,
        ): Promise<string> => "sig";
        assertEquals(typeof fn, "function");
    },
);

Deno.test(
    "Contract: EnqueueModelCallDeps invalid - missing computeJobSig",
    () => {
        const required: (keyof EnqueueModelCallDeps)[] = [
            "logger",
            "netlifyQueueUrl",
            "netlifyApiKey",
            "apiKeyForProvider",
            "computeJobSig",
        ];
        assertEquals(required.includes("computeJobSig"), true);
        assertEquals(required.length, 5);
    },
);

Deno.test(
    "Contract: AiWorkloadEvent operation discriminator allows only stream or embedding",
    () => {
        const isAllowedOperation = (
            value: string,
        ): value is AiWorkloadEvent["operation"] => {
            return value === "stream" || value === "embedding";
        };
        assertEquals(isAllowedOperation("stream"), true);
        assertEquals(isAllowedOperation("embedding"), true);
        assertEquals(isAllowedOperation("unknown"), false);
    },
);

Deno.test(
    "Contract: EnqueueModelCallParams userConfig is UserConfig object shape",
    () => {
        const uc: EnqueueModelCallParams["userConfig"] = {
            tier_output_cap_tokens: null,
        };
        const uc2: EnqueueModelCallParams["userConfig"] = {
            tier_output_cap_tokens: 32768,
        };
        assertEquals(uc.tier_output_cap_tokens, null);
        assertEquals(uc2.tier_output_cap_tokens, 32768);
    },
);

Deno.test(
    "Contract: AiWorkloadEvent user_config is UserConfig object shape",
    () => {
        const uc: AiWorkloadEvent["user_config"] = {
            tier_output_cap_tokens: null,
        };
        const uc2: AiWorkloadEvent["user_config"] = {
            tier_output_cap_tokens: 32768,
        };
        assertEquals(uc.tier_output_cap_tokens, null);
        assertEquals(uc2.tier_output_cap_tokens, 32768);
    },
);

Deno.test(
    "Contract: userConfig and user_config accept tier_output_cap_tokens null",
    () => {
        const paramsUserConfig: EnqueueModelCallParams["userConfig"] = {
            tier_output_cap_tokens: null,
        };
        const eventUserConfig: AiWorkloadEvent["user_config"] = {
            tier_output_cap_tokens: null,
        };
        assertEquals(paramsUserConfig.tier_output_cap_tokens, null);
        assertEquals(eventUserConfig.tier_output_cap_tokens, null);
    },
);
