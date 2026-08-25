import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
    NetlifyResponseBody,
    NetlifyResponseDeps,
    NetlifyResponseHandlerFn,
} from "./netlifyResponse.interface.ts";
import type { BoundSaveResponseFn, NodeTokenUsage } from "../dialectic-worker/saveResponse/saveResponse.interface.ts";

Deno.test("Contract: NetlifyResponseBody surface declares six required fields", () => {
    const surface: Record<keyof NetlifyResponseBody, true> = {
        job_id: true,
        assembled_content: true,
        token_usage: true,
        finish_reason: true,
        sig: true,
        processingTimeMs: true,
    };
    assertEquals(Object.keys(surface).length, 6);
});

Deno.test("Contract: NetlifyResponseBody valid — all fields with NodeTokenUsage", () => {
    const usage: NodeTokenUsage = {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
    };
    const body: NetlifyResponseBody = {
        job_id: "job-abc",
        assembled_content: "assembled text",
        token_usage: usage,
        finish_reason: "stop",
        sig: "deadbeef",
        processingTimeMs: 100,
    };
    assertEquals(typeof body.job_id, "string");
    assertEquals(typeof body.assembled_content, "string");
    assertEquals(typeof body.sig, "string");
    assertEquals(typeof body.finish_reason, "string");
    assertEquals(body.token_usage !== null, true);
});

Deno.test("Contract: NetlifyResponseBody valid — token_usage and finish_reason are nullable", () => {
    const body: NetlifyResponseBody = {
        job_id: "job-abc",
        assembled_content: "assembled text",
        token_usage: null,
        finish_reason: null,
        sig: "deadbeef",
        processingTimeMs: 0,
    };
    assertEquals(body.token_usage === null, true);
    assertEquals(body.finish_reason === null, true);
    assertEquals(typeof body.job_id, "string");
    assertEquals(typeof body.sig, "string");
});

Deno.test("Contract: NetlifyResponseDeps surface declares three dependency keys", () => {
    const surface: Record<keyof NetlifyResponseDeps, true> = {
        computeJobSig: true,
        adminClient: true,
        saveResponse: true,
    };
    assertEquals(Object.keys(surface).length, 3);
});
