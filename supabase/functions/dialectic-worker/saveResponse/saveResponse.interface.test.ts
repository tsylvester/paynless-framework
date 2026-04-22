import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    NodeTokenUsage,
    SaveResponseDeps,
    SaveResponseErrorReturn,
    SaveResponseParams,
    SaveResponsePayload,
    SaveResponseRequestBody,
    SaveResponseSuccessReturn,
} from "./saveResponse.interface.ts";

Deno.test(
    "Contract: NodeTokenUsage fields are numeric token counts",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
        };
        assertEquals(typeof usage.prompt_tokens, "number");
        assertEquals(typeof usage.completion_tokens, "number");
        assertEquals(typeof usage.total_tokens, "number");
    },
);

Deno.test(
    "Contract: SaveResponseParams declares job_id and dbClient only",
    () => {
        const surface: Record<keyof SaveResponseParams, true> = {
            job_id: true,
            dbClient: true,
        };
        assertEquals(Object.keys(surface).length, 2);
    },
);

Deno.test(
    "Contract: SaveResponsePayload with token_usage and finish_reason stop",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
        };
        const payload: SaveResponsePayload = {
            assembled_content: "assembled",
            token_usage: usage,
            finish_reason: "stop",
        };
        assertEquals(typeof payload.assembled_content, "string");
        assertEquals(typeof payload.finish_reason, "string");
        if (payload.token_usage !== null) {
            assertEquals(typeof payload.token_usage.prompt_tokens, "number");
            assertEquals(typeof payload.token_usage.completion_tokens, "number");
            assertEquals(typeof payload.token_usage.total_tokens, "number");
        }
    },
);

Deno.test(
    "Contract: SaveResponsePayload allows null token_usage and null finish_reason",
    () => {
        const payload: SaveResponsePayload = {
            assembled_content: "assembled",
            token_usage: null,
            finish_reason: null,
        };
        assertEquals(payload.token_usage === null, true);
        assertEquals(payload.finish_reason === null, true);
        assertEquals(typeof payload.assembled_content, "string");
    },
);

Deno.test(
    "Contract: SaveResponseRequestBody transport shape",
    () => {
        const usage: NodeTokenUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        const body: SaveResponseRequestBody = {
            job_id: "job-1",
            assembled_content: "content",
            token_usage: usage,
            finish_reason: "stop",
        };
        assertEquals("job_id" in body, true);
        assertEquals("assembled_content" in body, true);
        assertEquals("token_usage" in body, true);
        assertEquals("finish_reason" in body, true);
        assertEquals(typeof body.job_id, "string");
        assertEquals(typeof body.assembled_content, "string");
        assertEquals(typeof body.finish_reason, "string");
    },
);

Deno.test(
    "Contract: SaveResponseRequestBody allows null token_usage and null finish_reason",
    () => {
        const body: SaveResponseRequestBody = {
            job_id: "job-2",
            assembled_content: "content",
            token_usage: null,
            finish_reason: null,
        };
        assertEquals(body.token_usage === null, true);
        assertEquals(body.finish_reason === null, true);
    },
);

Deno.test(
    "Contract: SaveResponseDeps declares twelve dependency keys",
    () => {
        const surface: Record<keyof SaveResponseDeps, true> = {
            logger: true,
            fileManager: true,
            notificationService: true,
            continueJob: true,
            retryJob: true,
            resolveFinishReason: true,
            isIntermediateChunk: true,
            determineContinuation: true,
            buildUploadContext: true,
            debitTokens: true,
            sanitizeJsonContent: true,
            enqueueRenderJob: true,
        };
        assertEquals(Object.keys(surface).length, 12);
    },
);

Deno.test(
    "Contract: SaveResponseSuccessReturn each status member",
    async (t) => {
        await t.step("completed", () => {
            const r: SaveResponseSuccessReturn = { status: "completed" };
            assertEquals(r.status, "completed");
        });
        await t.step("needs_continuation", () => {
            const r: SaveResponseSuccessReturn = {
                status: "needs_continuation",
            };
            assertEquals(r.status, "needs_continuation");
        });
        await t.step("continuation_limit_reached", () => {
            const r: SaveResponseSuccessReturn = {
                status: "continuation_limit_reached",
            };
            assertEquals(r.status, "continuation_limit_reached");
        });
    },
);

Deno.test(
    "Contract: SaveResponseErrorReturn has Error and retriable boolean",
    () => {
        const err: SaveResponseErrorReturn = {
            error: new Error("x"),
            retriable: true,
        };
        assertEquals(err.error instanceof Error, true);
        assertEquals(typeof err.retriable, "boolean");
        assertEquals("error" in err, true);
        assertEquals("retriable" in err, true);
    },
);
