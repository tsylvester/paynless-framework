import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    NodeTokenUsage,
    SaveResponseDeps,
    SaveResponseSuccessReturn,
} from "./saveResponse.interface.ts";
import {
    isSaveResponseDeps,
    isSaveResponseErrorReturn,
    isSaveResponseParams,
    isSaveResponsePayload,
    isSaveResponseRequestBody,
    isSaveResponseSuccessReturn,
} from "./saveResponse.guard.ts";
import { createMockSaveResponseDeps } from "./saveResponse.mock.ts";

Deno.test(
    "Type Guard: isSaveResponseRequestBody returns true for valid transport body with NodeTokenUsage and finish_reason",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
        };
        const body = {
            job_id: "job-1",
            assembled_content: "content",
            token_usage: usage,
            finish_reason: "stop",
        };
        assertEquals(isSaveResponseRequestBody(body), true);
    },
);

Deno.test(
    "Type Guard: isSaveResponseRequestBody returns true when token_usage is null and finish_reason is null",
    () => {
        const body = {
            job_id: "job-1",
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
        };
        assertEquals(isSaveResponseRequestBody(body), true);
    },
);

Deno.test(
    "Type Guard: isSaveResponseRequestBody returns false when job_id is missing",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const body = {
            assembled_content: "c",
            token_usage: usage,
            finish_reason: "stop",
        };
        assertEquals(isSaveResponseRequestBody(body), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseRequestBody returns false when assembled_content is missing",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const body = {
            job_id: "j",
            token_usage: usage,
            finish_reason: "stop",
        };
        assertEquals(isSaveResponseRequestBody(body), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseRequestBody returns false when token_usage has wrong type",
    () => {
        const body = {
            job_id: "j",
            assembled_content: "c",
            token_usage: "not-usage",
            finish_reason: "stop",
        };
        assertEquals(isSaveResponseRequestBody(body), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseRequestBody returns false when finish_reason field is missing",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const body = {
            job_id: "job-1",
            assembled_content: "content",
            token_usage: usage,
        };
        assertEquals(isSaveResponseRequestBody(body), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseRequestBody returns false for null and non-record roots",
    () => {
        assertEquals(isSaveResponseRequestBody(null), false);
        assertEquals(isSaveResponseRequestBody(0), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseParams returns true for job_id and dbClient",
    () => {
        const params = {
            job_id: "job-1",
            dbClient: {},
        };
        assertEquals(isSaveResponseParams(params), true);
    },
);

Deno.test(
    "Type Guard: isSaveResponseParams returns false when job_id is missing",
    () => {
        const params = {
            dbClient: {},
        };
        assertEquals(isSaveResponseParams(params), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseParams returns false when dbClient is missing",
    () => {
        const params = {
            job_id: "job-1",
        };
        assertEquals(isSaveResponseParams(params), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseParams returns false for null and non-record roots",
    () => {
        assertEquals(isSaveResponseParams(null), false);
        assertEquals(isSaveResponseParams("x"), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponsePayload returns true for assembled_content, NodeTokenUsage, and finish_reason",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const payload = {
            assembled_content: "assembled",
            token_usage: usage,
            finish_reason: "stop",
        };
        assertEquals(isSaveResponsePayload(payload), true);
    },
);

Deno.test(
    "Type Guard: isSaveResponsePayload returns true when token_usage is null and finish_reason is null",
    () => {
        const payload = {
            assembled_content: "assembled",
            token_usage: null,
            finish_reason: null,
        };
        assertEquals(isSaveResponsePayload(payload), true);
    },
);

Deno.test(
    "Type Guard: isSaveResponsePayload returns false when assembled_content is missing",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const payload = {
            token_usage: usage,
            finish_reason: "stop",
        };
        assertEquals(isSaveResponsePayload(payload), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponsePayload returns false when token_usage has wrong type",
    () => {
        const payload = {
            assembled_content: "a",
            token_usage: 99,
            finish_reason: "stop",
        };
        assertEquals(isSaveResponsePayload(payload), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponsePayload returns false when finish_reason field is missing",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const payload = {
            assembled_content: "assembled",
            token_usage: usage,
        };
        assertEquals(isSaveResponsePayload(payload), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponsePayload returns false for null and non-record roots",
    () => {
        assertEquals(isSaveResponsePayload(null), false);
        assertEquals(isSaveResponsePayload([]), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseDeps returns true for full mock deps",
    () => {
        const deps: SaveResponseDeps = createMockSaveResponseDeps();
        assertEquals(isSaveResponseDeps(deps), true);
    },
);

Deno.test(
    "Type Guard: isSaveResponseDeps returns false when any single dependency field is missing",
    () => {
        const full: SaveResponseDeps = createMockSaveResponseDeps();
        const depKeys: (keyof SaveResponseDeps)[] = [
            "logger",
            "fileManager",
            "notificationService",
            "continueJob",
            "retryJob",
            "resolveFinishReason",
            "isIntermediateChunk",
            "determineContinuation",
            "buildUploadContext",
            "debitTokens",
            "sanitizeJsonContent",
            "enqueueRenderJob",
        ];
        for (let i = 0; i < depKeys.length; i++) {
            const key: keyof SaveResponseDeps = depKeys[i];
            const missingOne: Record<string, unknown> = { ...full };
            delete missingOne[key];
            assertEquals(isSaveResponseDeps(missingOne), false);
        }
    },
);

Deno.test(
    "Type Guard: isSaveResponseDeps returns false for null and non-record roots",
    () => {
        assertEquals(isSaveResponseDeps(null), false);
        assertEquals(isSaveResponseDeps(undefined), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseDeps returns false when enqueueRenderJob is missing",
    () => {
        const full: SaveResponseDeps = createMockSaveResponseDeps();
        const missingRender: Record<string, unknown> = { ...full };
        delete missingRender["enqueueRenderJob"];
        assertEquals(isSaveResponseDeps(missingRender), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseSuccessReturn returns true for each allowed status",
    async (t) => {
        await t.step("completed", () => {
            const value: SaveResponseSuccessReturn = { status: "completed" };
            assertEquals(isSaveResponseSuccessReturn(value), true);
        });
        await t.step("needs_continuation", () => {
            const value: SaveResponseSuccessReturn = {
                status: "needs_continuation",
            };
            assertEquals(isSaveResponseSuccessReturn(value), true);
        });
        await t.step("continuation_limit_reached", () => {
            const value: SaveResponseSuccessReturn = {
                status: "continuation_limit_reached",
            };
            assertEquals(isSaveResponseSuccessReturn(value), true);
        });
    },
);

Deno.test(
    "Type Guard: isSaveResponseSuccessReturn returns false for unknown status values",
    () => {
        const value = { status: "not_a_listed_status" };
        assertEquals(isSaveResponseSuccessReturn(value), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseSuccessReturn returns false for null and non-record roots",
    () => {
        assertEquals(isSaveResponseSuccessReturn(null), false);
        assertEquals(isSaveResponseSuccessReturn("completed"), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseErrorReturn returns true for Error and retriable boolean",
    () => {
        const value = {
            error: new Error("x"),
            retriable: false,
        };
        assertEquals(isSaveResponseErrorReturn(value), true);
    },
);

Deno.test(
    "Type Guard: isSaveResponseErrorReturn returns false when retriable is missing",
    () => {
        const value = {
            error: new Error("x"),
        };
        assertEquals(isSaveResponseErrorReturn(value), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseErrorReturn returns false when retriable is not a boolean",
    () => {
        const value = {
            error: new Error("x"),
            retriable: "yes",
        };
        assertEquals(isSaveResponseErrorReturn(value), false);
    },
);

Deno.test(
    "Type Guard: isSaveResponseErrorReturn returns false for null and non-record roots",
    () => {
        assertEquals(isSaveResponseErrorReturn(null), false);
        assertEquals(isSaveResponseErrorReturn({}), false);
    },
);
