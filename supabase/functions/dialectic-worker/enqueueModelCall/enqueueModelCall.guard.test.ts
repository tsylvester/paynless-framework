import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { EnqueueModelCallDeps } from "./enqueueModelCall.interface.ts";
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
    "Type Guard: isAiStreamEventData returns true for valid object with all five fields",
    () => {
        assertEquals(
            isAiStreamEventData({
                job_id: "job-1",
                api_identifier: "api-id",
                model_config: { api_identifier: "api-id" },
                chat_api_request: { message: "m", providerId: "p", promptId: "q" },
                user_jwt: "jwt-token",
            }),
            true,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when job_id is missing",
    () => {
        assertEquals(
            isAiStreamEventData({
                api_identifier: "api-id",
                model_config: { api_identifier: "api-id" },
                chat_api_request: { message: "m", providerId: "p", promptId: "q" },
                user_jwt: "jwt-token",
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when api_identifier is missing",
    () => {
        assertEquals(
            isAiStreamEventData({
                job_id: "job-1",
                model_config: { api_identifier: "api-id" },
                chat_api_request: { message: "m", providerId: "p", promptId: "q" },
                user_jwt: "jwt-token",
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when model_config is missing",
    () => {
        assertEquals(
            isAiStreamEventData({
                job_id: "job-1",
                api_identifier: "api-id",
                chat_api_request: { message: "m", providerId: "p", promptId: "q" },
                user_jwt: "jwt-token",
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when chat_api_request is missing",
    () => {
        assertEquals(
            isAiStreamEventData({
                job_id: "job-1",
                api_identifier: "api-id",
                model_config: { api_identifier: "api-id" },
                user_jwt: "jwt-token",
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventData returns false when user_jwt is missing",
    () => {
        assertEquals(
            isAiStreamEventData({
                job_id: "job-1",
                api_identifier: "api-id",
                model_config: { api_identifier: "api-id" },
                chat_api_request: { message: "m", providerId: "p", promptId: "q" },
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
    "Type Guard: isAiStreamEventBody returns true for valid object with eventName and data",
    () => {
        assertEquals(
            isAiStreamEventBody({
                eventName: "ai-stream",
                data: {
                    job_id: "job-1",
                    api_identifier: "api-id",
                    model_config: { api_identifier: "api-id" },
                    chat_api_request: { message: "m", providerId: "p", promptId: "q" },
                    user_jwt: "jwt-token",
                },
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
                },
            }),
            false,
        );
    },
);

Deno.test(
    "Type Guard: isAiStreamEventBody returns false when eventName is not ai-stream",
    () => {
        assertEquals(
            isAiStreamEventBody({
                eventName: "other-event",
                data: {
                    job_id: "job-1",
                    api_identifier: "api-id",
                    model_config: { api_identifier: "api-id" },
                    chat_api_request: { message: "m", providerId: "p", promptId: "q" },
                    user_jwt: "jwt-token",
                },
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
                eventName: "ai-stream",
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
