import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
    isDetermineContinuationParams,
    isDetermineContinuationResult,
} from "./determineContinuation.guard.ts";
import {
    buildDetermineContinuationParams,
    invalidateDetermineContinuationParams,
    buildDetermineContinuationResult,
    invalidateDetermineContinuationResult,
} from "./determineContinuation.mock.ts";

/* ------------------------------------------------------------------ */
/*  isDetermineContinuationParams                                      */
/* ------------------------------------------------------------------ */

/** the builder's valid default is accepted. */
Deno.test("isDetermineContinuationParams accepts the valid default", () => {
    assert(isDetermineContinuationParams(buildDetermineContinuationParams()));
});

/** valid overrides are accepted, including documentKey null and undefined. */
Deno.test("isDetermineContinuationParams accepts valid overrides", () => {
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ finishReasonContinue: true }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ wasStructurallyFixed: true }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ continueUntilComplete: true }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ documentKey: "business_case" }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ documentKey: null }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ documentKey: undefined }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ contextForDocuments: undefined }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ sourceObject: undefined }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ parsedContent: null }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ parsedContent: "string" }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ sourceObject: "string" }),
    ));
    assert(isDetermineContinuationParams(
        buildDetermineContinuationParams({ sourceObject: [1, 2, 3] }),
    ));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isDetermineContinuationParams rejects non-objects", () => {
    assert(!isDetermineContinuationParams(null));
    assert(!isDetermineContinuationParams(undefined));
    assert(!isDetermineContinuationParams(7));
    assert(!isDetermineContinuationParams("x"));
    assert(!isDetermineContinuationParams([]));
});

/** each typed property, corrupted in turn, is rejected. */
Deno.test("isDetermineContinuationParams rejects each corrupted typed property", () => {
    assert(!isDetermineContinuationParams(
        invalidateDetermineContinuationParams({ finishReasonContinue: "not-boolean" }),
    ));
    assert(!isDetermineContinuationParams(
        invalidateDetermineContinuationParams({ wasStructurallyFixed: "not-boolean" }),
    ));
    assert(!isDetermineContinuationParams(
        invalidateDetermineContinuationParams({ continueUntilComplete: "not-boolean" }),
    ));
    assert(!isDetermineContinuationParams(
        invalidateDetermineContinuationParams({ documentKey: 42 }),
    ));
    assert(!isDetermineContinuationParams(
        invalidateDetermineContinuationParams({ contextForDocuments: "not-an-array" }),
    ));
});

/** each required property, omitted in turn, is rejected. */
Deno.test("isDetermineContinuationParams rejects each omitted required property", () => {
    {
        const { finishReasonContinue: _o, ...rest } = buildDetermineContinuationParams();
        assert(!isDetermineContinuationParams(rest));
    }
    {
        const { wasStructurallyFixed: _o, ...rest } = buildDetermineContinuationParams();
        assert(!isDetermineContinuationParams(rest));
    }
    {
        const { parsedContent: _o, ...rest } = buildDetermineContinuationParams();
        assert(!isDetermineContinuationParams(rest));
    }
    {
        const { continueUntilComplete: _o, ...rest } = buildDetermineContinuationParams();
        assert(!isDetermineContinuationParams(rest));
    }
    {
        const { documentKey: _o, ...rest } = buildDetermineContinuationParams();
        assert(!isDetermineContinuationParams(rest));
    }
    {
        const { contextForDocuments: _o, ...rest } = buildDetermineContinuationParams();
        assert(!isDetermineContinuationParams(rest));
    }
    {
        const { sourceObject: _o, ...rest } = buildDetermineContinuationParams();
        assert(!isDetermineContinuationParams(rest));
    }
});

/* ------------------------------------------------------------------ */
/*  isDetermineContinuationResult                                      */
/* ------------------------------------------------------------------ */

/** the builder's valid default is accepted. */
Deno.test("isDetermineContinuationResult accepts the valid default", () => {
    assert(isDetermineContinuationResult(buildDetermineContinuationResult()));
});

/** valid overrides are accepted. */
Deno.test("isDetermineContinuationResult accepts valid overrides", () => {
    assert(isDetermineContinuationResult(
        buildDetermineContinuationResult({ shouldContinue: true }),
    ));
    assert(isDetermineContinuationResult(
        buildDetermineContinuationResult({ shouldContinue: false }),
    ));
});

/** null, undefined, primitives, and arrays are rejected. */
Deno.test("isDetermineContinuationResult rejects non-objects", () => {
    assert(!isDetermineContinuationResult(null));
    assert(!isDetermineContinuationResult(undefined));
    assert(!isDetermineContinuationResult(7));
    assert(!isDetermineContinuationResult("x"));
    assert(!isDetermineContinuationResult([]));
});

/** shouldContinue corrupted to a non-boolean is rejected. */
Deno.test("isDetermineContinuationResult rejects corrupted shouldContinue", () => {
    assert(!isDetermineContinuationResult(
        invalidateDetermineContinuationResult({ shouldContinue: "not-boolean" }),
    ));
});

/** shouldContinue omitted is rejected. */
Deno.test("isDetermineContinuationResult rejects omitted shouldContinue", () => {
    const { shouldContinue: _o, ...rest } = buildDetermineContinuationResult();
    assert(!isDetermineContinuationResult(rest));
});

/** a record with shouldContinue plus an extra key is rejected, the guard requiring exactly one key. */
Deno.test("isDetermineContinuationResult rejects extra keys", () => {
    const withExtra = { ...buildDetermineContinuationResult(), extra: "field" };
    assert(!isDetermineContinuationResult(withExtra));
});
