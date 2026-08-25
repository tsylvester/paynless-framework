import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
    isNetlifyResponseBody,
    isNetlifyResponseDeps,
} from "./netlifyResponse.guard.ts";
import {
    buildNetlifyResponseBody,
    invalidateNetlifyResponseBody,
    buildNetlifyResponseDeps,
    invalidateNetlifyResponseDeps,
} from "./netlifyResponse.mock.ts";

// ── isNetlifyResponseBody — valid cases ──────────────────────────────────────

Deno.test("Guard: isNetlifyResponseBody accepts full valid body with NodeTokenUsage", () => {
    assertEquals(isNetlifyResponseBody(buildNetlifyResponseBody({
        token_usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        finish_reason: "stop",
        sig: "deadbeef",
    })), true);
});

Deno.test("Guard: isNetlifyResponseBody accepts null token_usage and null finish_reason", () => {
    assertEquals(isNetlifyResponseBody(buildNetlifyResponseBody()), true);
});

// ── isNetlifyResponseBody — invalid cases ────────────────────────────────────

Deno.test("Guard: isNetlifyResponseBody rejects missing job_id", () => {
    const { job_id: _j, ...missing } = buildNetlifyResponseBody();
    assertEquals(isNetlifyResponseBody(missing), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects missing sig", () => {
    const { sig: _s, ...missing } = buildNetlifyResponseBody();
    assertEquals(isNetlifyResponseBody(missing), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects missing assembled_content", () => {
    const { assembled_content: _a, ...missing } = buildNetlifyResponseBody();
    assertEquals(isNetlifyResponseBody(missing), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects job_id that is not a string", () => {
    assertEquals(isNetlifyResponseBody(invalidateNetlifyResponseBody({ job_id: 42 })), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects sig that is not a string", () => {
    assertEquals(isNetlifyResponseBody(invalidateNetlifyResponseBody({ sig: 99 })), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects null", () => {
    assertEquals(isNetlifyResponseBody(null), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects non-object", () => {
    assertEquals(isNetlifyResponseBody("not an object"), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects missing processingTimeMs", () => {
    const { processingTimeMs: _p, ...missing } = buildNetlifyResponseBody();
    assertEquals(isNetlifyResponseBody(missing), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects non-numeric processingTimeMs", () => {
    assertEquals(isNetlifyResponseBody(invalidateNetlifyResponseBody({ processingTimeMs: "not-a-number" })), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects non-finite processingTimeMs", () => {
    assertEquals(isNetlifyResponseBody(invalidateNetlifyResponseBody({ processingTimeMs: Infinity })), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects negative processingTimeMs", () => {
    assertEquals(isNetlifyResponseBody(invalidateNetlifyResponseBody({ processingTimeMs: -1 })), false);
});

// ── isNetlifyResponseDeps — valid cases ──────────────────────────────────────

Deno.test("Guard: isNetlifyResponseDeps accepts fully valid deps with no saveResponseDeps", () => {
    assertEquals(isNetlifyResponseDeps(buildNetlifyResponseDeps()), true);
});

// ── isNetlifyResponseDeps — invalid cases ────────────────────────────────────

Deno.test("Guard: isNetlifyResponseDeps rejects missing computeJobSig", () => {
    const { computeJobSig: _c, ...missing } = buildNetlifyResponseDeps();
    assertEquals(isNetlifyResponseDeps(missing), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects non-function computeJobSig", () => {
    assertEquals(isNetlifyResponseDeps(invalidateNetlifyResponseDeps({ computeJobSig: "not-a-function" })), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects missing adminClient", () => {
    const { adminClient: _a, ...missing } = buildNetlifyResponseDeps();
    assertEquals(isNetlifyResponseDeps(missing), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects wrong-typed adminClient", () => {
    assertEquals(isNetlifyResponseDeps(invalidateNetlifyResponseDeps({ adminClient: "not-a-client" })), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects missing saveResponse", () => {
    const { saveResponse: _s, ...missing } = buildNetlifyResponseDeps();
    assertEquals(isNetlifyResponseDeps(missing), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects non-function saveResponse", () => {
    assertEquals(isNetlifyResponseDeps(invalidateNetlifyResponseDeps({ saveResponse: "not-a-function" })), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects null", () => {
    assertEquals(isNetlifyResponseDeps(null), false);
});
