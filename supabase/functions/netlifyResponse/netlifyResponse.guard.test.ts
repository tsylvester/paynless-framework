import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
    isNetlifyResponseBody,
    isNetlifyResponseDeps,
} from "./netlifyResponse.guard.ts";
import { mockComputeJobSig } from "../_shared/utils/computeJobSig/computeJobSig.mock.ts";
import { createMockSaveResponseDeps } from "../dialectic-worker/saveResponse/saveResponse.provides.ts";

// ── isNetlifyResponseBody — valid cases ──────────────────────────────────────

Deno.test("Guard: isNetlifyResponseBody accepts full valid body with NodeTokenUsage", () => {
    assertEquals(isNetlifyResponseBody({
        job_id: "job-1",
        assembled_content: "assembled text",
        token_usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        finish_reason: "stop",
        sig: "deadbeef",
    }), true);
});

Deno.test("Guard: isNetlifyResponseBody accepts null token_usage and null finish_reason", () => {
    assertEquals(isNetlifyResponseBody({
        job_id: "job-1",
        assembled_content: "assembled text",
        token_usage: null,
        finish_reason: null,
        sig: "deadbeef",
    }), true);
});

// ── isNetlifyResponseBody — invalid cases ────────────────────────────────────

Deno.test("Guard: isNetlifyResponseBody rejects missing job_id", () => {
    assertEquals(isNetlifyResponseBody({
        assembled_content: "assembled text",
        token_usage: null,
        finish_reason: null,
        sig: "deadbeef",
    }), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects missing sig", () => {
    assertEquals(isNetlifyResponseBody({
        job_id: "job-1",
        assembled_content: "assembled text",
        token_usage: null,
        finish_reason: null,
    }), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects missing assembled_content", () => {
    assertEquals(isNetlifyResponseBody({
        job_id: "job-1",
        token_usage: null,
        finish_reason: null,
        sig: "deadbeef",
    }), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects job_id that is not a string", () => {
    assertEquals(isNetlifyResponseBody({
        job_id: 42,
        assembled_content: "assembled text",
        token_usage: null,
        finish_reason: null,
        sig: "deadbeef",
    }), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects sig that is not a string", () => {
    assertEquals(isNetlifyResponseBody({
        job_id: "job-1",
        assembled_content: "assembled text",
        token_usage: null,
        finish_reason: null,
        sig: 99,
    }), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects null", () => {
    assertEquals(isNetlifyResponseBody(null), false);
});

Deno.test("Guard: isNetlifyResponseBody rejects non-object", () => {
    assertEquals(isNetlifyResponseBody("not an object"), false);
});

// ── isNetlifyResponseDeps — valid cases ──────────────────────────────────────

Deno.test("Guard: isNetlifyResponseDeps accepts fully valid deps", () => {
    assertEquals(isNetlifyResponseDeps({
        computeJobSig: mockComputeJobSig,
        adminClient: {},
        saveResponse: async () => ({ status: "completed" }),
        saveResponseDeps: createMockSaveResponseDeps(),
    }), true);
});

// ── isNetlifyResponseDeps — invalid cases ────────────────────────────────────

Deno.test("Guard: isNetlifyResponseDeps rejects missing computeJobSig", () => {
    assertEquals(isNetlifyResponseDeps({
        adminClient: {},
        saveResponse: async () => ({ status: "completed" }),
        saveResponseDeps: createMockSaveResponseDeps(),
    }), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects non-function computeJobSig", () => {
    assertEquals(isNetlifyResponseDeps({
        computeJobSig: "not-a-function",
        adminClient: {},
        saveResponse: async () => ({ status: "completed" }),
        saveResponseDeps: createMockSaveResponseDeps(),
    }), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects missing adminClient", () => {
    assertEquals(isNetlifyResponseDeps({
        computeJobSig: mockComputeJobSig,
        saveResponse: async () => ({ status: "completed" }),
        saveResponseDeps: createMockSaveResponseDeps(),
    }), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects missing saveResponse", () => {
    assertEquals(isNetlifyResponseDeps({
        computeJobSig: mockComputeJobSig,
        adminClient: {},
        saveResponseDeps: createMockSaveResponseDeps(),
    }), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects non-function saveResponse", () => {
    assertEquals(isNetlifyResponseDeps({
        computeJobSig: mockComputeJobSig,
        adminClient: {},
        saveResponse: "not-a-function",
        saveResponseDeps: createMockSaveResponseDeps(),
    }), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects missing saveResponseDeps", () => {
    assertEquals(isNetlifyResponseDeps({
        computeJobSig: mockComputeJobSig,
        adminClient: {},
        saveResponse: async () => ({ status: "completed" }),
    }), false);
});

Deno.test("Guard: isNetlifyResponseDeps rejects null", () => {
    assertEquals(isNetlifyResponseDeps(null), false);
});
