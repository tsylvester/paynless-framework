import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    BoundSaveResponseFn,
    NodeTokenUsage,
    SaveResponseDeps,
    SaveResponseErrorReturn,
    SaveResponseFn,
    SaveResponseParams,
    SaveResponsePayload,
    SaveResponseRequestBody,
    SaveResponseReturn,
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
    "Contract: SaveResponsePayload has the required surface of four keys",
    () => {
        const surface: Record<keyof SaveResponsePayload, true> = {
            assembled_content: true,
            token_usage: true,
            finish_reason: true,
            processingTimeMs: true,
        };
        assertEquals(Object.keys(surface).length, 4);
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
    "Contract: SaveResponseDeps declares eight dependency keys",
    () => {
        const surface: Record<keyof SaveResponseDeps, true> = {
            logger: true,
            retryJob: true,
            loadJobContext: true,
            assembleAiResponse: true,
            debitForResponse: true,
            prepareResponseContent: true,
            saveContributionResponse: true,
            saveCompressedResponse: true,
        };
        assertEquals(Object.keys(surface).length, 8);
    },
);

Deno.test(
    "Contract: SaveResponseSuccessReturn.status discriminates four terminal states",
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
        await t.step("waiting_for_children", () => {
            const r: SaveResponseSuccessReturn = {
                status: "waiting_for_children",
            };
            assertEquals(r.status, "waiting_for_children");
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

Deno.test(
    "Contract: SaveResponseReturn has exactly two arms — success and error",
    () => {
        const success: SaveResponseSuccessReturn = { status: "completed" };
        const asReturn: SaveResponseReturn = success;
        assertEquals(asReturn === success, true);
        const error: SaveResponseErrorReturn = {
            error: new Error("x"),
            retriable: false,
        };
        const asReturnErr: SaveResponseReturn = error;
        assertEquals(asReturnErr === error, true);
    },
);

Deno.test(
    "Contract: SaveResponseFn resolves to its declared Promise<SaveResponseReturn>",
    () => {
        const success: SaveResponseSuccessReturn = { status: "completed" };
        const returned: ReturnType<SaveResponseFn> = Promise.resolve(success);
        const declared: Promise<SaveResponseReturn> = returned;
        assertEquals(declared instanceof Promise, true);
        const error: SaveResponseErrorReturn = {
            error: new Error("x"),
            retriable: false,
        };
        const returnedErr: ReturnType<SaveResponseFn> = Promise.resolve(error);
        const declaredErr: Promise<SaveResponseReturn> = returnedErr;
        assertEquals(declaredErr instanceof Promise, true);
    },
);

Deno.test(
    "Contract: BoundSaveResponseFn drops deps and resolves to Promise<SaveResponseReturn>",
    () => {
        const success: SaveResponseSuccessReturn = { status: "completed" };
        const returned: ReturnType<BoundSaveResponseFn> = Promise.resolve(success);
        const declared: Promise<SaveResponseReturn> = returned;
        assertEquals(declared instanceof Promise, true);
        const error: SaveResponseErrorReturn = {
            error: new Error("x"),
            retriable: false,
        };
        const returnedErr: ReturnType<BoundSaveResponseFn> = Promise.resolve(error);
        const declaredErr: Promise<SaveResponseReturn> = returnedErr;
        assertEquals(declaredErr instanceof Promise, true);
    },
);
