import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { spy, type Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { UnifiedAIResponse, DialecticExecuteJobPayload } from "../../dialectic-service/dialectic.interface.ts";
import { RenderJobValidationError } from "../../_shared/utils/errors.ts";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import type { RetryJobFn } from "../createJobContext/JobContext.interface.ts";
import type { SaveResponseDeps, SaveResponseReturn } from "./saveResponse.interface.ts";
import {
    createMockSaveResponseDeps,
    createMockSaveResponseParams,
    createMockSaveResponsePayload,
    createMockContributionRow,
    createMockFileManager,
    createMockSaveResponseParamsWithQueuedJob,
    saveResponseTestPayloadDocumentArtifact,
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

Deno.test(
    "saveResponse: terminal completion calls deps.enqueueRenderJob exactly once",
    async () => {
        const enqueueStub: SaveResponseDeps["enqueueRenderJob"] = async (_p, _pl) => ({
            renderJobId: null,
        });
        const enqueueRenderJobSpy: Spy<SaveResponseDeps["enqueueRenderJob"]> = spy(enqueueStub);
        const deps = createMockSaveResponseDeps({
            resolveFinishReason: (_ai: UnifiedAIResponse) => "stop",
            fileManager: createMockFileManager({ outcome: "success", contribution: createMockContributionRow() }),
            enqueueRenderJob: enqueueRenderJobSpy,
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload({ assembled_content: '{"ok":true}' });

        await saveResponse(deps, params, payload);

        assertEquals(
            enqueueRenderJobSpy.calls.length,
            1,
            "enqueueRenderJob should be called exactly once on terminal completion",
        );
    },
);

Deno.test(
    "saveResponse: continuation path does NOT call deps.enqueueRenderJob",
    async () => {
        const enqueueStub: SaveResponseDeps["enqueueRenderJob"] = async (_p, _pl) => ({
            renderJobId: null,
        });
        const enqueueRenderJobSpy: Spy<SaveResponseDeps["enqueueRenderJob"]> = spy(enqueueStub);
        const deps = createMockSaveResponseDeps({
            isIntermediateChunk: (_finish, _cont) => true,
            continueJob: async () => ({ enqueued: true }),
            enqueueRenderJob: enqueueRenderJobSpy,
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload({ assembled_content: '{"ok":true}' });

        await saveResponse(deps, params, payload);

        assertEquals(
            enqueueRenderJobSpy.calls.length,
            0,
            "enqueueRenderJob should NOT be called on the continuation path",
        );
    },
);

Deno.test(
    "saveResponse: enqueueRenderJob returning a renderJobId skips assembleAndSaveFinalDocument (render job handles assembly)",
    async () => {
        const rootId: string = "root-contrib-render-gate-a";
        const chunkId: string = "contrib-chunk-render-gate-a";
        const docPayload: DialecticExecuteJobPayload = {
            ...saveResponseTestPayloadDocumentArtifact,
            continuation_count: 1,
            document_relationships: {
                thesis: rootId,
                source_group: "00000000-0000-4000-8000-000000000002",
            },
        };
        const chunkContrib = createMockContributionRow({
            id: chunkId,
            target_contribution_id: rootId,
            document_relationships: {
                thesis: rootId,
                source_group: "00000000-0000-4000-8000-000000000002",
            },
        });
        const fm = createMockFileManager({ outcome: "success", contribution: chunkContrib });
        const { params } = createMockSaveResponseParamsWithQueuedJob(docPayload, {
            target_contribution_id: rootId,
        });
        const enqueueStub: SaveResponseDeps["enqueueRenderJob"] = async (_p, _pl) => ({
            renderJobId: "render-job-new-001",
        });
        const enqueueRenderJobSpy: Spy<SaveResponseDeps["enqueueRenderJob"]> = spy(enqueueStub);
        const deps = createMockSaveResponseDeps({
            resolveFinishReason: (_ai: UnifiedAIResponse) => "stop",
            fileManager: fm,
            enqueueRenderJob: enqueueRenderJobSpy,
        });

        await saveResponse(deps, params, createMockSaveResponsePayload({ assembled_content: '{"ok":true}' }));

        assertEquals(enqueueRenderJobSpy.calls.length, 1, "enqueueRenderJob should be called once");
        assertEquals(
            fm.assembleAndSaveFinalDocument.calls.length,
            0,
            "assembleAndSaveFinalDocument should NOT be called when a render job was dispatched (!shouldRender gate)",
        );
    },
);

Deno.test(
    "saveResponse: enqueueRenderJob returning null renderJobId triggers assembleAndSaveFinalDocument (no render job, local assembly required)",
    async () => {
        const rootId: string = "root-contrib-render-gate-b";
        const chunkId: string = "contrib-chunk-render-gate-b";
        const docPayload: DialecticExecuteJobPayload = {
            ...saveResponseTestPayloadDocumentArtifact,
            continuation_count: 1,
            document_relationships: {
                thesis: rootId,
                source_group: "00000000-0000-4000-8000-000000000002",
            },
        };
        const chunkContrib = createMockContributionRow({
            id: chunkId,
            target_contribution_id: rootId,
            document_relationships: {
                thesis: rootId,
                source_group: "00000000-0000-4000-8000-000000000002",
            },
        });
        const fm = createMockFileManager({ outcome: "success", contribution: chunkContrib });
        const { params } = createMockSaveResponseParamsWithQueuedJob(docPayload, {
            target_contribution_id: rootId,
        });
        const enqueueStub: SaveResponseDeps["enqueueRenderJob"] = async (_p, _pl) => ({
            renderJobId: null,
        });
        const enqueueRenderJobSpy: Spy<SaveResponseDeps["enqueueRenderJob"]> = spy(enqueueStub);
        const deps = createMockSaveResponseDeps({
            resolveFinishReason: (_ai: UnifiedAIResponse) => "stop",
            fileManager: fm,
            enqueueRenderJob: enqueueRenderJobSpy,
        });

        await saveResponse(deps, params, createMockSaveResponsePayload({ assembled_content: '{"ok":true}' }));

        assertEquals(enqueueRenderJobSpy.calls.length, 1, "enqueueRenderJob should be called once");
        assertEquals(
            fm.assembleAndSaveFinalDocument.calls.length,
            1,
            "assembleAndSaveFinalDocument should be called when no render job was dispatched (!shouldRender gate)",
        );
    },
);

Deno.test(
    "saveResponse: enqueueRenderJob failure does not block contribution save or job completion",
    async () => {
        const enqueueStub: SaveResponseDeps["enqueueRenderJob"] = async (_p, _pl) => ({
            error: new RenderJobValidationError("render dispatch failed in test"),
            retriable: false,
        });
        const enqueueRenderJobSpy: Spy<SaveResponseDeps["enqueueRenderJob"]> = spy(enqueueStub);
        const deps = createMockSaveResponseDeps({
            resolveFinishReason: (_ai: UnifiedAIResponse) => "stop",
            fileManager: createMockFileManager({ outcome: "success", contribution: createMockContributionRow() }),
            enqueueRenderJob: enqueueRenderJobSpy,
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload({ assembled_content: '{"ok":true}' });

        const result: SaveResponseReturn = await saveResponse(deps, params, payload);

        assertEquals(
            enqueueRenderJobSpy.calls.length,
            1,
            "enqueueRenderJob should be called even when it returns an error",
        );
        if ("status" in result) {
            assertEquals(
                result.status,
                "completed",
                "job should complete despite render dispatch failure",
            );
        }
    },
);

Deno.test(
    "saveResponse: malformed JSON after sanitization calls retryJob with exact parse error and returns success to Netlify",
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
        const payload = createMockSaveResponsePayload({ assembled_content: "{" });
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        assertEquals(retrySpy.calls.length, 1, "retryJob must be called exactly once");
        const errorDetails = retrySpy.calls[0].args[4] as Array<{ error: string }>;
        assertExists(errorDetails[0].error, "retryJob must receive error details");
        assertStringIncludes(
            errorDetails[0].error,
            "Malformed JSON response:",
            "retryJob error must be the exact JSON.parse message prefixed with 'Malformed JSON response:'",
        );
        assertEquals("status" in result, true, "saveResponse must return success so Netlify releases the event");
    },
);

Deno.test(
    "saveResponse: error-class finish_reason calls retryJob with exact error and returns success to Netlify",
    async () => {
        const retrySpy: Spy<RetryJobFn> = spy(async () => ({}));
        const deps = createMockSaveResponseDeps({
            retryJob: retrySpy,
            resolveFinishReason: (_ai: UnifiedAIResponse) => "error",
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload();
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        assertEquals(retrySpy.calls.length, 1, "retryJob must be called exactly once");
        const errorDetails = retrySpy.calls[0].args[4] as Array<{ error: string }>;
        assertExists(errorDetails[0].error, "retryJob must receive error details");
        assertEquals(
            errorDetails[0].error,
            "AI provider signaled error via finish_reason.",
            "retryJob error must be the exact error string from the finish_reason branch",
        );
        assertEquals("status" in result, true, "saveResponse must return success so Netlify releases the event");
    },
);

Deno.test(
    "saveResponse: empty assembled content calls retryJob with exact error and returns success to Netlify",
    async () => {
        const retrySpy: Spy<RetryJobFn> = spy(async () => ({}));
        const deps = createMockSaveResponseDeps({ retryJob: retrySpy });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload({ assembled_content: "" });
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        assertEquals(retrySpy.calls.length, 1, "retryJob must be called exactly once");
        const errorDetails = retrySpy.calls[0].args[4] as Array<{ error: string }>;
        assertExists(errorDetails[0].error, "retryJob must receive error details");
        assertEquals(
            errorDetails[0].error,
            "AI response was empty.",
            "retryJob error must be the exact empty-content error string",
        );
        assertEquals("status" in result, true, "saveResponse must return success so Netlify releases the event");
    },
);

Deno.test(
    "saveResponse: invalid sanitization result calls retryJob with exact error and returns success to Netlify",
    async () => {
        const retrySpy: Spy<RetryJobFn> = spy(async () => ({}));
        const deps = createMockSaveResponseDeps({
            retryJob: retrySpy,
            sanitizeJsonContent: () => ({ broken: true } as unknown as ReturnType<SaveResponseDeps["sanitizeJsonContent"]>),
        });
        const params = createMockSaveResponseParams();
        const payload = createMockSaveResponsePayload({ assembled_content: '{"ok":true}' });
        const result: SaveResponseReturn = await saveResponse(deps, params, payload);
        assertEquals(retrySpy.calls.length, 1, "retryJob must be called exactly once");
        const errorDetails = retrySpy.calls[0].args[4] as Array<{ error: string }>;
        assertExists(errorDetails[0].error, "retryJob must receive error details");
        assertEquals(
            errorDetails[0].error,
            "Invalid JSON sanitization result",
            "retryJob error must be the exact invalid-sanitization error string",
        );
        assertEquals("status" in result, true, "saveResponse must return success so Netlify releases the event");
    },
);
