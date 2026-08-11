import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { EnqueueModelCallDeps } from "./enqueueModelCall.interface.ts";
import {
    createMockAiStreamEventBody,
    createMockAiStreamEventData,
    createMockEnqueueModelCallDeps,
    createMockEnqueueModelCallErrorReturn,
    createMockEnqueueModelCallParams,
    createMockEnqueueModelCallPayload,
    createMockEnqueueModelCallSuccessReturn,
    invalidateAiStreamEventBody,
    invalidateAiStreamEventData,
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
    "Type Guard: isEnqueueModelCallParams returns true for params with a stray output_type key",
    () => {
        const params = createMockEnqueueModelCallParams();
        const withStray = { ...params, output_type: "stray" };
        assertEquals(isEnqueueModelCallParams(withStray), true);
    },
);

Deno.test(
    "Type Guard: isEnqueueModelCallPayload returns true for full mock payload",
    () => {
        assertEquals(
            isEnqueueModelCallPayload(createMockEnqueueModelCallPayload()),
            true,
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
        const full = createMockEnqueueModelCallPayload();
        assertEquals(
            isEnqueueModelCallPayload({
                chatApiRequest: full.chatApiRequest,
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
    "Type Guard: isAiStreamEventData returns true for valid object with sig field",
    () => {
        assertEquals(
            isAiStreamEventData(createMockAiStreamEventData()),
            true,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when job_id is missing",
    () => {
        const { job_id: _job_id, ...rest } = createMockAiStreamEventData();
        assertEquals(isAiStreamEventData(rest), false);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when api_identifier is missing",
    () => {
        const { api_identifier: _api_identifier, ...rest } = createMockAiStreamEventData();
        assertEquals(isAiStreamEventData(rest), false);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when model_config is missing",
    () => {
        const { model_config: _model_config, ...rest } = createMockAiStreamEventData();
        assertEquals(isAiStreamEventData(rest), false);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when chat_api_request is missing",
    () => {
        const { chat_api_request: _chat_api_request, ...rest } = createMockAiStreamEventData();
        assertEquals(isAiStreamEventData(rest), false);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when sig is missing",
    () => {
        const { sig: _sig, ...rest } = createMockAiStreamEventData();
        assertEquals(isAiStreamEventData(rest), false);
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
    "Type Guard: isAiStreamEventBody returns true for valid object with eventName and data",
    () => {
        assertEquals(
            isAiStreamEventBody(createMockAiStreamEventBody()),
            true,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventBody returns false when eventName is missing",
    () => {
        const { eventName: _eventName, ...rest } = createMockAiStreamEventBody();
        assertEquals(isAiStreamEventBody(rest), false);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventBody returns false when eventName is not ai-stream-background",
    () => {
        assertEquals(
            isAiStreamEventBody(
                invalidateAiStreamEventBody({ eventName: "ai-stream" }),
            ),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventBody returns false when data is missing",
    () => {
        const { data: _data, ...rest } = createMockAiStreamEventBody();
        assertEquals(isAiStreamEventBody(rest), false);
    },
);

Deno.test(
    "Type Guard: isAiStreamEventBody returns false when data is present but malformed",
    () => {
        const { sig: _sig, ...malformedData } = createMockAiStreamEventData();
        assertEquals(
            isAiStreamEventBody(
                invalidateAiStreamEventBody({ data: malformedData }),
            ),
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
    "Type Guard: isAiStreamEventData returns false when user_jwt is present instead of sig",
    () => {
        const { sig: _sig, ...rest } = createMockAiStreamEventData({
            user_config: { tier_output_cap_tokens: null },
        });
        assertEquals(
            isAiStreamEventData({ ...rest, user_jwt: "jwt-token" }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns true when tier_output_cap_tokens is null",
    () => {
        assertEquals(
            isAiStreamEventData(
                createMockAiStreamEventData({
                    user_config: { tier_output_cap_tokens: null },
                }),
            ),
            true,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns true when tier_output_cap_tokens is 32768",
    () => {
        assertEquals(
            isAiStreamEventData(
                createMockAiStreamEventData({
                    user_config: { tier_output_cap_tokens: 32768 },
                }),
            ),
            true,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when tier_output_cap_tokens is missing",
    () => {
        assertEquals(
            isAiStreamEventData(
                invalidateAiStreamEventData({ user_config: {} }),
            ),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when model_config is not an AiModelExtendedConfig",
    () => {
        assertEquals(
            isAiStreamEventData(
                invalidateAiStreamEventData({ model_config: {} }),
            ),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when chat_api_request is not a ChatApiRequest",
    () => {
        assertEquals(
            isAiStreamEventData(
                invalidateAiStreamEventData({ chat_api_request: {} }),
            ),
            false,
        );
    },
);
