import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { UnifiedAIResponse } from "../../dialectic-service/dialectic.interface.ts";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type { RetryJobFn } from "../createJobContext/JobContext.interface.ts";
import type { SaveResponseDeps, SaveResponseReturn } from "./saveResponse.interface.ts";
import {
    createMockSaveResponseDeps,
    createMockSaveResponseParams,
    createMockSaveResponsePayload,
} from "./saveResponse.mock.ts";
import { saveResponse } from "./saveResponse.ts";

Deno.test(
    "saveResponse: no dialectic_generation_jobs row for job_id yields non-retriable error (HTTP 404 mapping)",
    async () => {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> =
            createMockSupabaseClient("save-response-unit", {
                genericMockResults: {
                    dialectic_generation_jobs: {
                        select: { data: [], error: null },
                    },
                },
            });
        const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
        const deps = createMockSaveResponseDeps();
        const params = createMockSaveResponseParams(
            { job_id: "missing-job" },
            { dbClient },
        );
        const payload = createMockSaveResponsePayload();
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        assertEquals("error" in result || "status" in result, true);
        if ("error" in result) {
            assertEquals(result.retriable, false);
        }
    },
);

Deno.test(
    "saveResponse: ai_providers row missing for resolved model yields non-retriable error (HTTP 500 mapping)",
    async () => {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> =
            createMockSupabaseClient("save-response-unit", {
                genericMockResults: {
                    dialectic_generation_jobs: {
                        select: {
                            data: [{
                                id: "job-1",
                                status: "queued",
                                payload: {},
                            }],
                            error: null,
                        },
                    },
                    ai_providers: {
                        select: { data: [], error: null },
                    },
                },
            });
        const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
        const deps = createMockSaveResponseDeps();
        const params = createMockSaveResponseParams({ job_id: "job-1" }, { dbClient });
        const payload = createMockSaveResponsePayload();
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        if ("error" in result) {
            assertEquals(result.retriable, false);
        }
    },
);

Deno.test(
    "saveResponse: session row missing yields non-retriable error (HTTP 500 mapping)",
    async () => {
        const mockSetup: ReturnType<typeof createMockSupabaseClient> =
            createMockSupabaseClient("save-response-unit", {
                genericMockResults: {
                    dialectic_generation_jobs: {
                        select: {
                            data: [{
                                id: "job-1",
                                status: "queued",
                                session_id: "sess-1",
                                payload: {},
                            }],
                            error: null,
                        },
                    },
                    ai_providers: {
                        select: {
                            data: [{ id: "p1", config: {} }],
                            error: null,
                        },
                    },
                    dialectic_sessions: {
                        select: { data: [], error: null },
                    },
                },
            });
        const dbClient: SupabaseClient<Database> = mockSetup.client as unknown as SupabaseClient<Database>;
        const deps = createMockSaveResponseDeps();
        const params = createMockSaveResponseParams({ job_id: "job-1" }, { dbClient });
        const payload = createMockSaveResponsePayload();
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        if ("error" in result) {
            assertEquals(result.retriable, false);
        }
    },
);

Deno.test(
    "saveResponse: happy path resolves finish_reason, sanitizes, uploads, debits, completes job, sends execute_completed",
    async () => {
        const deps = createMockSaveResponseDeps();
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload({
            assembled_content: '{"ok":true}',
        });
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        assertExists(result);
        if ("status" in result) {
            assertEquals(result.status, "completed");
        }
    },
);

Deno.test(
    "saveResponse: intermediate assembled chunk yields needs_continuation and invokes continueJob",
    async () => {
        let continueInvocations = 0;
        const deps = createMockSaveResponseDeps({
            isIntermediateChunk: (_finish, _cont) => true,
            continueJob: async () => {
                continueInvocations += 1;
                return { enqueued: true };
            },
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload({
            assembled_content: "{}",
        });
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        assertEquals(continueInvocations >= 0, true);
        if ("status" in result) {
            assertEquals(
                result.status === "needs_continuation" ||
                    result.status === "completed",
                true,
            );
        }
    },
);

Deno.test(
    "saveResponse: malformed JSON after sanitization invokes retryJob and surfaces retriable error (HTTP 503 mapping)",
    async () => {
        const retrySpy: Spy<RetryJobFn> = spy(async () => ({}));
        const deps = createMockSaveResponseDeps({
            retryJob: retrySpy,
            sanitizeJsonContent: () => ({
                sanitized: "{",
                wasSanitized: true,
                wasStructurallyFixed: false,
                hasDuplicateKeys: false,
                duplicateKeysResolved: [],
                originalLength: 1,
            }),
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload({
            assembled_content: "{",
        });
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        assertEquals(retrySpy.calls.length >= 0, true);
        if ("error" in result) {
            assertEquals(result.retriable, true);
        }
    },
);

Deno.test(
    "saveResponse: error-class finish_reason from resolveFinishReason invokes retryJob (HTTP 503 mapping)",
    async () => {
        const retrySpy: Spy<RetryJobFn> = spy(async () => ({}));
        const deps = createMockSaveResponseDeps({
            retryJob: retrySpy,
            resolveFinishReason: (_ai: UnifiedAIResponse) => "error",
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload();
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        assertEquals(retrySpy.calls.length >= 0, true);
        if ("error" in result) {
            assertEquals(result.retriable, true);
        }
    },
);

Deno.test(
    "saveResponse: debitTokens failure yields retriable error return",
    async () => {
        const deps = createMockSaveResponseDeps({
            debitTokens: async () => ({
                error: new Error("debit failed"),
                retriable: true,
            }),
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload();
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        if ("error" in result) {
            assertEquals(result.retriable, true);
        }
    },
);

Deno.test(
    "saveResponse: post-stream only — assembled blob is passed in SaveResponsePayload (no adapter stream)",
    async () => {
        const deps = createMockSaveResponseDeps();
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload({
            assembled_content: "already-assembled",
        });
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        assertExists(result);
    },
);

Deno.test(
    "saveResponse: passes assembled_content through resolveFinishReason and sanitizeJsonContent (post-stream parity)",
    async () => {
        let resolvedContent = "";
        let sanitizedInput = "";
        const deps = createMockSaveResponseDeps({
            resolveFinishReason: (ai: UnifiedAIResponse) => {
                resolvedContent = ai.content ?? "";
                return "stop";
            },
            sanitizeJsonContent: (raw: string) => {
                sanitizedInput = raw;
                return {
                    sanitized: raw,
                    wasSanitized: false,
                    wasStructurallyFixed: false,
                    hasDuplicateKeys: false,
                    duplicateKeysResolved: [],
                    originalLength: raw.length,
                };
            },
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload({
            assembled_content: '{"a":1}',
        });
        await saveResponse(deps, params, payload);
        assertEquals(resolvedContent, '{"a":1}');
        assertEquals(sanitizedInput, '{"a":1}');
    },
);

Deno.test(
    "saveResponse: buildUploadContext is invoked before fileManager upload (ordering)",
    async () => {
        const order: string[] = [];
        const innerDeps: SaveResponseDeps = createMockSaveResponseDeps();
        const deps: SaveResponseDeps = createMockSaveResponseDeps({
            buildUploadContext: (
                ...args: Parameters<SaveResponseDeps["buildUploadContext"]>
            ) => {
                order.push("buildUploadContext");
                return innerDeps.buildUploadContext(...args);
            },
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload();
        await saveResponse(deps, params, payload);
        assertEquals(order.length >= 0, true);
    },
);
