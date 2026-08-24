import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SaveResponseDeps } from "./saveResponse.interface.ts";
import {
    isNodeTokenUsage,
    isSaveResponseDeps,
    isSaveResponseErrorReturn,
    isSaveResponseParams,
    isSaveResponsePayload,
    isSaveResponseRequestBody,
    isSaveResponseSuccessReturn,
} from "./saveResponse.guard.ts";
import {
    buildNodeTokenUsage,
    buildSaveResponseDeps,
    buildSaveResponseErrorReturn,
    buildSaveResponseParams,
    buildSaveResponsePayload,
    buildSaveResponseRequestBody,
    buildSaveResponseSuccessReturn,
    invalidateNodeTokenUsage,
    invalidateSaveResponseDeps,
    invalidateSaveResponseErrorReturn,
    invalidateSaveResponseParams,
    invalidateSaveResponsePayload,
    invalidateSaveResponseRequestBody,
    invalidateSaveResponseSuccessReturn,
} from "./saveResponse.mock.ts";

/* ------------------------------------------------------------------ */
/*  isNodeTokenUsage                                                   */
/* ------------------------------------------------------------------ */

/** the builder's valid default is accepted. */
Deno.test("isNodeTokenUsage accepts the valid default", () => {
    assert(isNodeTokenUsage(buildNodeTokenUsage()));
});

/** valid overrides are accepted. */
Deno.test("isNodeTokenUsage accepts valid overrides", () => {
    assert(isNodeTokenUsage(buildNodeTokenUsage({ prompt_tokens: 100 })));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isNodeTokenUsage rejects non-objects", () => {
    assert(!isNodeTokenUsage(null));
    assert(!isNodeTokenUsage(undefined));
    assert(!isNodeTokenUsage(7));
    assert(!isNodeTokenUsage("x"));
    assert(!isNodeTokenUsage([]));
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isNodeTokenUsage rejects each corrupted property", () => {
    assert(!isNodeTokenUsage(invalidateNodeTokenUsage({ prompt_tokens: "x" })));
    assert(!isNodeTokenUsage(invalidateNodeTokenUsage({ completion_tokens: "x" })));
    assert(!isNodeTokenUsage(invalidateNodeTokenUsage({ total_tokens: "x" })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isNodeTokenUsage rejects each omitted required property", () => {
    {
        const { prompt_tokens: _o, ...rest } = buildNodeTokenUsage();
        assert(!isNodeTokenUsage(rest));
    }
    {
        const { completion_tokens: _o, ...rest } = buildNodeTokenUsage();
        assert(!isNodeTokenUsage(rest));
    }
    {
        const { total_tokens: _o, ...rest } = buildNodeTokenUsage();
        assert(!isNodeTokenUsage(rest));
    }
});

/* ------------------------------------------------------------------ */
/*  isSaveResponseParams                                               */
/* ------------------------------------------------------------------ */

/** the builder's valid default is accepted. */
Deno.test("isSaveResponseParams accepts the valid default", () => {
    assert(isSaveResponseParams(buildSaveResponseParams()));
});

/** valid overrides are accepted. */
Deno.test("isSaveResponseParams accepts valid overrides", () => {
    assert(isSaveResponseParams(buildSaveResponseParams({ job_id: "other-id" })));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isSaveResponseParams rejects non-objects", () => {
    assert(!isSaveResponseParams(null));
    assert(!isSaveResponseParams(undefined));
    assert(!isSaveResponseParams(7));
    assert(!isSaveResponseParams("x"));
    assert(!isSaveResponseParams([]));
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isSaveResponseParams rejects each corrupted property", () => {
    assert(!isSaveResponseParams(invalidateSaveResponseParams({ job_id: 99 })));
    assert(!isSaveResponseParams(invalidateSaveResponseParams({ dbClient: "not-client" })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isSaveResponseParams rejects each omitted required property", () => {
    {
        const { job_id: _o, ...rest } = buildSaveResponseParams();
        assert(!isSaveResponseParams(rest));
    }
    {
        const { dbClient: _o, ...rest } = buildSaveResponseParams();
        assert(!isSaveResponseParams(rest));
    }
});

/* ------------------------------------------------------------------ */
/*  isSaveResponsePayload                                              */
/* ------------------------------------------------------------------ */

/** the builder's valid default is accepted. */
Deno.test("isSaveResponsePayload accepts the valid default", () => {
    assert(isSaveResponsePayload(buildSaveResponsePayload()));
});

/** valid overrides, including null token_usage and string finish_reason, are accepted. */
Deno.test("isSaveResponsePayload accepts valid overrides", () => {
    assert(isSaveResponsePayload(buildSaveResponsePayload({ token_usage: null })));
    assert(isSaveResponsePayload(buildSaveResponsePayload({ finish_reason: "stop" })));
    assert(isSaveResponsePayload(buildSaveResponsePayload({ processingTimeMs: 42 })));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isSaveResponsePayload rejects non-objects", () => {
    assert(!isSaveResponsePayload(null));
    assert(!isSaveResponsePayload(undefined));
    assert(!isSaveResponsePayload(7));
    assert(!isSaveResponsePayload("x"));
    assert(!isSaveResponsePayload([]));
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isSaveResponsePayload rejects each corrupted property", () => {
    assert(!isSaveResponsePayload(invalidateSaveResponsePayload({ assembled_content: 99 })));
    assert(!isSaveResponsePayload(invalidateSaveResponsePayload({ token_usage: "not-usage" })));
    assert(!isSaveResponsePayload(invalidateSaveResponsePayload({ finish_reason: 99 })));
    assert(!isSaveResponsePayload(invalidateSaveResponsePayload({ processingTimeMs: "not-number" })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isSaveResponsePayload rejects each omitted required property", () => {
    {
        const { assembled_content: _o, ...rest } = buildSaveResponsePayload();
        assert(!isSaveResponsePayload(rest));
    }
    {
        const { token_usage: _o, ...rest } = buildSaveResponsePayload();
        assert(!isSaveResponsePayload(rest));
    }
    {
        const { finish_reason: _o, ...rest } = buildSaveResponsePayload();
        assert(!isSaveResponsePayload(rest));
    }
    {
        const { processingTimeMs: _o, ...rest } = buildSaveResponsePayload();
        assert(!isSaveResponsePayload(rest));
    }
});

/* ------------------------------------------------------------------ */
/*  isSaveResponseRequestBody                                          */
/* ------------------------------------------------------------------ */

/** the builder's valid default is accepted. */
Deno.test("isSaveResponseRequestBody accepts the valid default", () => {
    assert(isSaveResponseRequestBody(buildSaveResponseRequestBody()));
});

/** valid overrides, including null token_usage and null finish_reason, are accepted. */
Deno.test("isSaveResponseRequestBody accepts valid overrides", () => {
    assert(isSaveResponseRequestBody(buildSaveResponseRequestBody({ token_usage: null, finish_reason: null })));
    assert(isSaveResponseRequestBody(buildSaveResponseRequestBody({ finish_reason: "stop" })));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isSaveResponseRequestBody rejects non-objects", () => {
    assert(!isSaveResponseRequestBody(null));
    assert(!isSaveResponseRequestBody(undefined));
    assert(!isSaveResponseRequestBody(7));
    assert(!isSaveResponseRequestBody("x"));
    assert(!isSaveResponseRequestBody([]));
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isSaveResponseRequestBody rejects each corrupted property", () => {
    assert(!isSaveResponseRequestBody(invalidateSaveResponseRequestBody({ job_id: 99 })));
    assert(!isSaveResponseRequestBody(invalidateSaveResponseRequestBody({ assembled_content: 99 })));
    assert(!isSaveResponseRequestBody(invalidateSaveResponseRequestBody({ token_usage: "not-usage" })));
    assert(!isSaveResponseRequestBody(invalidateSaveResponseRequestBody({ finish_reason: 99 })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isSaveResponseRequestBody rejects each omitted required property", () => {
    {
        const { job_id: _o, ...rest } = buildSaveResponseRequestBody();
        assert(!isSaveResponseRequestBody(rest));
    }
    {
        const { assembled_content: _o, ...rest } = buildSaveResponseRequestBody();
        assert(!isSaveResponseRequestBody(rest));
    }
    {
        const { token_usage: _o, ...rest } = buildSaveResponseRequestBody();
        assert(!isSaveResponseRequestBody(rest));
    }
    {
        const { finish_reason: _o, ...rest } = buildSaveResponseRequestBody();
        assert(!isSaveResponseRequestBody(rest));
    }
});

/* ------------------------------------------------------------------ */
/*  isSaveResponseDeps                                                 */
/* ------------------------------------------------------------------ */

/** the builder's valid default is accepted. */
Deno.test("isSaveResponseDeps accepts the valid default", () => {
    assert(isSaveResponseDeps(buildSaveResponseDeps()));
});

/** valid overrides are accepted. */
Deno.test("isSaveResponseDeps accepts valid overrides", () => {
    const base = buildSaveResponseDeps();
    assert(isSaveResponseDeps(buildSaveResponseDeps({ logger: base.logger })));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isSaveResponseDeps rejects non-objects", () => {
    assert(!isSaveResponseDeps(null));
    assert(!isSaveResponseDeps(undefined));
    assert(!isSaveResponseDeps(7));
    assert(!isSaveResponseDeps("x"));
    assert(!isSaveResponseDeps([]));
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isSaveResponseDeps rejects each corrupted property", () => {
    assert(!isSaveResponseDeps(invalidateSaveResponseDeps({ logger: "not-object" })));
    assert(!isSaveResponseDeps(invalidateSaveResponseDeps({ retryJob: "not-fn" })));
    assert(!isSaveResponseDeps(invalidateSaveResponseDeps({ loadJobContext: "not-fn" })));
    assert(!isSaveResponseDeps(invalidateSaveResponseDeps({ assembleAiResponse: "not-fn" })));
    assert(!isSaveResponseDeps(invalidateSaveResponseDeps({ debitForResponse: "not-fn" })));
    assert(!isSaveResponseDeps(invalidateSaveResponseDeps({ prepareResponseContent: "not-fn" })));
    assert(!isSaveResponseDeps(invalidateSaveResponseDeps({ saveContributionResponse: "not-fn" })));
    assert(!isSaveResponseDeps(invalidateSaveResponseDeps({ saveCompressedResponse: "not-fn" })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isSaveResponseDeps rejects each omitted required property", () => {
    const keys: (keyof SaveResponseDeps)[] = [
        "logger",
        "retryJob",
        "loadJobContext",
        "assembleAiResponse",
        "debitForResponse",
        "prepareResponseContent",
        "saveContributionResponse",
        "saveCompressedResponse",
    ];
    for (const key of keys) {
        const missing: Record<string, unknown> = { ...buildSaveResponseDeps() };
        delete missing[key];
        assert(!isSaveResponseDeps(missing));
    }
});

/* ------------------------------------------------------------------ */
/*  isSaveResponseSuccessReturn                                        */
/* ------------------------------------------------------------------ */

/** the builder's valid default is accepted. */
Deno.test("isSaveResponseSuccessReturn accepts the valid default", () => {
    assert(isSaveResponseSuccessReturn(buildSaveResponseSuccessReturn()));
});

/** each of the four valid statuses is accepted, including waiting_for_children. */
Deno.test("isSaveResponseSuccessReturn accepts each valid status", () => {
    assert(isSaveResponseSuccessReturn(buildSaveResponseSuccessReturn({ status: "completed" })));
    assert(isSaveResponseSuccessReturn(buildSaveResponseSuccessReturn({ status: "needs_continuation" })));
    assert(isSaveResponseSuccessReturn(buildSaveResponseSuccessReturn({ status: "continuation_limit_reached" })));
    assert(isSaveResponseSuccessReturn(buildSaveResponseSuccessReturn({ status: "waiting_for_children" })));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isSaveResponseSuccessReturn rejects non-objects", () => {
    assert(!isSaveResponseSuccessReturn(null));
    assert(!isSaveResponseSuccessReturn(undefined));
    assert(!isSaveResponseSuccessReturn(7));
    assert(!isSaveResponseSuccessReturn("completed"));
    assert(!isSaveResponseSuccessReturn([]));
});

/** status corrupted to an unknown string or a non-string is rejected. */
Deno.test("isSaveResponseSuccessReturn rejects corrupted status", () => {
    assert(!isSaveResponseSuccessReturn(invalidateSaveResponseSuccessReturn({ status: "not_a_status" })));
    assert(!isSaveResponseSuccessReturn(invalidateSaveResponseSuccessReturn({ status: 99 })));
});

/** status omitted is rejected. */
Deno.test("isSaveResponseSuccessReturn rejects omitted status", () => {
    const { status: _o, ...rest } = buildSaveResponseSuccessReturn();
    assert(!isSaveResponseSuccessReturn(rest));
});

/* ------------------------------------------------------------------ */
/*  isSaveResponseErrorReturn                                          */
/* ------------------------------------------------------------------ */

/** the builder's valid default is accepted. */
Deno.test("isSaveResponseErrorReturn accepts the valid default", () => {
    assert(isSaveResponseErrorReturn(buildSaveResponseErrorReturn()));
});

/** valid overrides are accepted. */
Deno.test("isSaveResponseErrorReturn accepts valid overrides", () => {
    assert(isSaveResponseErrorReturn(buildSaveResponseErrorReturn({ retriable: true })));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isSaveResponseErrorReturn rejects non-objects", () => {
    assert(!isSaveResponseErrorReturn(null));
    assert(!isSaveResponseErrorReturn(undefined));
    assert(!isSaveResponseErrorReturn(7));
    assert(!isSaveResponseErrorReturn("x"));
    assert(!isSaveResponseErrorReturn([]));
});

/** each property, corrupted in turn, is rejected. */
Deno.test("isSaveResponseErrorReturn rejects each corrupted property", () => {
    assert(!isSaveResponseErrorReturn(invalidateSaveResponseErrorReturn({ error: "not-an-error" })));
    assert(!isSaveResponseErrorReturn(invalidateSaveResponseErrorReturn({ retriable: "not-boolean" })));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isSaveResponseErrorReturn rejects each omitted required property", () => {
    {
        const { error: _o, ...rest } = buildSaveResponseErrorReturn();
        assert(!isSaveResponseErrorReturn(rest));
    }
    {
        const { retriable: _o, ...rest } = buildSaveResponseErrorReturn();
        assert(!isSaveResponseErrorReturn(rest));
    }
});
