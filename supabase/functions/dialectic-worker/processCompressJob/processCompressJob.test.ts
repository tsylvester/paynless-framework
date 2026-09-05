import { assert, assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isRecord, isJson } from "../../_shared/utils/type_guards.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { buildDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import { buildDialecticJobRow, buildDialecticStageRecipeStep, buildDialecticRecipeTemplateStep, buildOutputRule } from "../../_shared/dialectic.mock.ts";
import { buildAssembledPrompt } from "../../_shared/prompt-assembler/prompt-assembler.mock.ts";
import { mockBoundAssembleContinuationPrompt } from "../../_shared/prompt-assembler/assembleContinuationPrompt/assembleContinuationPrompt.mock.ts";
import { buildMockProvider } from "../../_shared/ai_service/ai_provider.mock.ts";
import type { AssembleCompressionPromptParams, AssembleCompressionPromptPayload, AssembleCompressionPromptReturn } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import type { BoundAssembleContinuationPromptFn, AssembleContinuationPromptReturn } from "../../_shared/prompt-assembler/prompt-assembler.interface.ts";
import type { DialecticJobRow } from "../../dialectic-service/dialectic.interface.ts";
import type { PrepareModelJobParams, PrepareModelJobPayload, PrepareModelJobReturn } from "../prepareModelJob/prepareModelJob.interface.ts";
import { buildPrepareModelJobQueuedReturn, buildPrepareModelJobPendingReturn, buildPrepareModelJobErrorReturn } from "../prepareModelJob/prepareModelJob.mock.ts";
import { processCompressJob } from "./processCompressJob.ts";
import { buildProcessCompressJobDeps, buildProcessCompressJobParams, buildProcessCompressJobPayload, invalidateProcessCompressJobPayload } from "./processCompressJob.mock.ts";
import { ProcessCompressJobError } from "./processCompressJob.interface.ts";
import type { ProcessCompressJobReturn } from "./processCompressJob.interface.ts";

// ── Entry narrowing ───────────────────────────────────────────────────────────

/**
 * Contract: a payload that is not a ProcessCompressJobPayload returns the error arm
 *   with retriable: false, calls no dependency and writes no row.
 * Arrange: a payload from invalidateProcessCompressJobPayload({ job: null }), failing
 *   isProcessCompressJobPayload at the entry guard; spied deps and a mock Supabase
 *   client.
 * Act:     processCompressJob with the spied deps, params, and the invalid payload.
 * Assert:  the result is the error arm with retriable false; no assembler, dispatcher,
 *   or constructStoragePath call is made; no dialectic_generation_jobs update is written.
 */
Deno.test("processCompressJob: invalid entry payload returns non-retriable error, calls no dependency and writes no row", async () => {
    // Arrange
    const payload = invalidateProcessCompressJobPayload({ job: null });
    const mockSetup = createMockSupabaseClient("process-compress-job");
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const continuationSpy = spy(mockBoundAssembleContinuationPrompt);
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const baseDeps = buildProcessCompressJobDeps();
    const constructStoragePathSpy = spy(baseDeps.constructStoragePath);
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        assembleContinuationPrompt: continuationSpy,
        prepareModelJob: prepareModelJobSpy,
        constructStoragePath: constructStoragePathSpy,
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
    assertEquals(compressionSpy.calls.length, 0);
    assertEquals(continuationSpy.calls.length, 0);
    assertEquals(prepareModelJobSpy.calls.length, 0);
    assertEquals(constructStoragePathSpy.calls.length, 0);
    const updateCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
    assertExists(updateCalls);
    assertEquals(updateCalls.callCount, 0);
});

/**
 * Contract: a payload.job.payload failing isDialecticCompressJobPayload surfaces
 *   that guard's per-member diagnostic on the error arm, retriable false.
 * Arrange: a payload whose job.payload is { invalid: true }, not a compress payload.
 * Act:     processCompressJob with default deps, params, and the invalid payload.
 * Assert:  the result is the error arm with retriable false and an Error diagnostic.
 */
Deno.test("processCompressJob: invalid payload.job.payload surfaces diagnostic on error arm", async () => {
    // Arrange
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: { invalid: true } }),
    });
    const deps = buildProcessCompressJobDeps();
    const mockSetup = createMockSupabaseClient("process-compress-job");
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.error instanceof Error, true);
        assertEquals(result.retriable, false);
    }
});

// ── Dedup layer 2 ────────────────────────────────────────────────────────────

/**
 * Contract: a constructStoragePath throw returns the error arm, retriable false.
 * Arrange: a payload whose compress content is valid; deps with a constructStoragePath
 *   that throws.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with retriable false.
 */
Deno.test("processCompressJob: path construction throw returns non-retriable error", async () => {
    // Arrange
    const payload = buildProcessCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job");
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const deps = buildProcessCompressJobDeps({
        constructStoragePath: () => { throw new Error("path construction failed"); },
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
});

/**
 * Contract: a dialectic_project_resources existence read failure returns the error
 *   arm, retriable true.
 * Arrange: a mock Supabase client whose dialectic_project_resources select returns
 *   an error.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with retriable true.
 */
Deno.test("processCompressJob: dedup query failure returns retriable error", async () => {
    // Arrange
    const payload = buildProcessCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: null, error: new Error("dedup read failed") },
            },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const deps = buildProcessCompressJobDeps();

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, true);
    }
});

/**
 * Contract: a dedup hit marks the job row completed (keyed on payload.job.id) and
 *   returns { queued: false } without calling either assembler or the dispatcher.
 * Arrange: a mock Supabase client whose dialectic_project_resources select returns
 *   an existing row and whose dialectic_generation_jobs update succeeds.
 * Act:     processCompressJob with spied assemblers and dispatcher.
 * Assert:  the result is { queued: false }; the assemblers and dispatcher are never
 *   called; the update sets status to completed keyed on payload.job.id.
 */
Deno.test("processCompressJob: dedup hit marks job completed and returns { queued: false }", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const expectedPath = buildProcessCompressJobDeps().constructStoragePath({
        fileType: FileType.CompressedContext,
        projectId: compressPayload.projectId,
        sessionId: compressPayload.sessionId,
        iteration: compressPayload.iterationNumber,
        stageSlug: compressPayload.stageSlug,
        output_type: compressPayload.output_type,
        sourceType: compressPayload.sourceType,
        documentKey: compressPayload.documentKey,
        sourceId: compressPayload.sourceId,
    });
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [{ id: "existing-resource" }], error: null },
            },
            dialectic_generation_jobs: {
                update: { data: [], error: null },
            },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const continuationSpy = spy(mockBoundAssembleContinuationPrompt);
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        assembleContinuationPrompt: continuationSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(result, { queued: false });
    assertEquals(compressionSpy.calls.length, 0);
    assertEquals(continuationSpy.calls.length, 0);
    assertEquals(prepareModelJobSpy.calls.length, 0);
    const resourceEqCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_project_resources", "eq");
    assertExists(resourceEqCalls);
    assertEquals(resourceEqCalls.callsArgs[0], ["storage_path", expectedPath.storagePath]);
    assertEquals(resourceEqCalls.callsArgs[1], ["file_name", expectedPath.fileName]);
    const updateCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
    assertExists(updateCalls);
    assertEquals(updateCalls.callCount, 1);
    const updateData = updateCalls.callsArgs[0][0];
    assert(isRecord(updateData));
    assertEquals(updateData["status"], "completed");
    const jobEqCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "eq");
    assertExists(jobEqCalls);
    assertEquals(jobEqCalls.callsArgs[0], ["id", payload.job.id]);
});

/**
 * Contract: a dedup-hit update failure returns the error arm, retriable true.
 * Arrange: a mock Supabase client whose dialectic_project_resources select returns
 *   an existing row and whose dialectic_generation_jobs update returns an error.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with retriable true.
 */
Deno.test("processCompressJob: dedup update failure returns retriable error", async () => {
    // Arrange
    const payload = buildProcessCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [{ id: "existing-resource" }], error: null },
            },
            dialectic_generation_jobs: {
                update: { data: null, error: new Error("update failed") },
            },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const deps = buildProcessCompressJobDeps();

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, true);
    }
});

/**
 * Contract: a dedup-hit path performs only the completed-status update and no
 *   payload update, and calls neither assembler nor the dispatcher.
 * Arrange: a mock Supabase client whose dialectic_project_resources select returns
 *   an existing row and whose dialectic_generation_jobs update succeeds.
 * Act:     processCompressJob with spied assemblers and dispatcher.
 * Assert:  the result is { queued: false }; the single update sets status to
 *   completed and carries no payload key.
 */
Deno.test("processCompressJob: dedup-hit path performs no payload update", async () => {
    // Arrange
    const payload = buildProcessCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [{ id: "existing-resource" }], error: null },
            },
            dialectic_generation_jobs: {
                update: { data: [], error: null },
            },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const continuationSpy = spy(mockBoundAssembleContinuationPrompt);
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        assembleContinuationPrompt: continuationSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(result, { queued: false });
    assertEquals(compressionSpy.calls.length, 0);
    assertEquals(continuationSpy.calls.length, 0);
    assertEquals(prepareModelJobSpy.calls.length, 0);
    const updateCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
    assertExists(updateCalls);
    assertEquals(updateCalls.callCount, 1);
    const updateData = updateCalls.callsArgs[0][0];
    assert(isRecord(updateData));
    assertEquals(updateData["status"], "completed");
    assert(!("payload" in updateData) || updateData["payload"] === undefined);
});

// ── Provider resolution ───────────────────────────────────────────────────────

/**
 * Contract: an ai_providers query error returns the error arm, retriable true.
 * Arrange: a mock Supabase client whose ai_providers select returns an error.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with retriable true.
 */
Deno.test("processCompressJob: ai_providers query failure returns retriable error", async () => {
    // Arrange
    const payload = buildProcessCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: null, error: new Error("provider read failed") } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const deps = buildProcessCompressJobDeps();

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, true);
    }
});

/**
 * Contract: a missing ai_providers row returns the error arm with "Provider not
 *   found", retriable true.
 * Arrange: a mock Supabase client whose ai_providers select returns data null,
 *   error null.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with retriable true and a "Provider not
 *   found" message.
 */
Deno.test("processCompressJob: provider not found returns retriable error", async () => {
    // Arrange
    const payload = buildProcessCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: null, error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const deps = buildProcessCompressJobDeps();

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, true);
        assert(result.error instanceof Error);
        assert(result.error.message.includes("Provider not found"));
    }
});

// ── Consuming step resolution ─────────────────────────────────────────────────

/**
 * Contract: a stage with no active_recipe_instance_id returns the error arm,
 *   retriable false.
 * Arrange: a mock Supabase client whose dialectic_stages select returns a stage
 *   with active_recipe_instance_id null.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with retriable false.
 */
Deno.test("processCompressJob: missing active_recipe_instance_id returns non-retriable error", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: {
                select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: null }], error: null },
            },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const deps = buildProcessCompressJobDeps();

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
});

/**
 * Contract: no recipe step matching the narrowed output_type returns the error
 *   arm, retriable false.
 * Arrange: a mock Supabase client whose recipe steps return a step with a
 *   non-matching output_type.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with retriable false.
 */
Deno.test("processCompressJob: no recipe step matching output_type returns non-retriable error", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "other",
        step_slug: "other",
        step_name: "Other",
        output_type: FileType.PendingFile,
        step_description: "other step",
        outputs_required: buildOutputRule({ files_to_generate: [] }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: {
                select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null },
            },
            dialectic_stage_recipe_instances: {
                select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null },
            },
            dialectic_stage_recipe_steps: {
                select: { data: [mockStep], error: null },
            },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const deps = buildProcessCompressJobDeps();

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
});

/**
 * Contract: a cloned recipe instance resolves the consuming step from
 *   dialectic_stage_recipe_steps and passes it to assembleCompressionPrompt.
 * Arrange: a mock Supabase client with a cloned instance and a matching step.
 * Act:     processCompressJob with a spied compression assembler and dispatcher.
 * Assert:  the compression assembler is called once with the consuming step's
 *   outputs_required and step_description, and content from the narrowed payload.
 */
Deno.test("processCompressJob: cloned recipe instance resolves consuming step", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress the contribution",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(compressionSpy.calls.length, 1);
    const assembleParams = compressionSpy.calls[0].args[0];
    assert(isRecord(assembleParams));
    const consumingStep = assembleParams["consumingStep"];
    assert(isRecord(consumingStep));
    assertEquals(consumingStep["outputs_required"], mockStep.outputs_required);
    assertEquals(consumingStep["step_description"], mockStep.step_description);
    const assemblePayload = compressionSpy.calls[0].args[1];
    assert(isRecord(assemblePayload));
    assertEquals(assemblePayload["mode"], compressPayload.mode);
    assertEquals(assemblePayload["content"], compressPayload.content);
});

/**
 * Contract: a template recipe instance resolves the consuming step from
 *   dialectic_recipe_template_steps and passes it to assembleCompressionPrompt.
 * Arrange: a mock Supabase client with a template instance and a matching step.
 * Act:     processCompressJob with a spied compression assembler and dispatcher.
 * Assert:  the compression assembler is called once with the consuming step's
 *   outputs_required and step_description.
 */
Deno.test("processCompressJob: template recipe instance resolves consuming step", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticRecipeTemplateStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress via template",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    });
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: false, template_id: "template-1" }], error: null } },
            dialectic_recipe_template_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(compressionSpy.calls.length, 1);
    const assembleParams = compressionSpy.calls[0].args[0];
    assert(isRecord(assembleParams));
    const consumingStep = assembleParams["consumingStep"];
    assert(isRecord(consumingStep));
    assertEquals(consumingStep["outputs_required"], mockStep.outputs_required);
    assertEquals(consumingStep["step_description"], mockStep.step_description);
});

// ── Assembly ──────────────────────────────────────────────────────────────────

/**
 * Contract: an error return from assembleCompressionPrompt is propagated unchanged
 *   and the dispatcher is never called.
 * Arrange: a mock Supabase client with a matching step; a compression assembler
 *   spy that returns an error return.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with the same error identity and retriable
 *   flag; the dispatcher spy has zero calls.
 */
Deno.test("processCompressJob: assembleCompressionPrompt error propagates", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const assembleError = new Error("assembly failed");
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => ({ error: assembleError, retriable: false }));
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(prepareModelJobSpy.calls.length, 0);
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.error, assembleError);
        assertEquals(result.retriable, false);
    }
});

/**
 * Contract: an error return from assembleContinuationPrompt is propagated unchanged
 *   and the dispatcher is never called.
 * Arrange: a payload with continuation_count >= 1; a continuation assembler spy
 *   that returns an error return.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with the same error identity and retriable
 *   flag; the dispatcher spy has zero calls.
 */
Deno.test("processCompressJob: assembleContinuationPrompt error propagates unchanged and dispatcher is never called", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({ continuation_count: 1 });
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const continuationError = new Error("continuation failed");
    const continuationFn: BoundAssembleContinuationPromptFn = async (_job: DialecticJobRow): Promise<AssembleContinuationPromptReturn> => ({ error: continuationError, retriable: false });
    const continuationSpy = spy(continuationFn);
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleContinuationPrompt: continuationSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(prepareModelJobSpy.calls.length, 0);
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.error, continuationError);
        assertEquals(result.retriable, false);
    }
});

// ── Continuation selection ────────────────────────────────────────────────────

/**
 * Contract: continuation_count >= 1 calls assembleContinuationPrompt and never
 *   assembleCompressionPrompt.
 * Arrange: a payload with continuation_count 1; spied continuation and compression
 *   assemblers.
 * Act:     processCompressJob.
 * Assert:  the continuation spy is called once; the compression spy is never
 *   called.
 */
Deno.test("processCompressJob: continuation_count >= 1 calls assembleContinuationPrompt and never assembleCompressionPrompt", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({ continuation_count: 1 });
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const continuationSpy = spy(mockBoundAssembleContinuationPrompt);
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleContinuationPrompt: continuationSpy,
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(result, { queued: true });
    assertEquals(continuationSpy.calls.length, 1);
    assertEquals(compressionSpy.calls.length, 0);
});

/**
 * Contract: continuation_count 0 calls assembleCompressionPrompt and never
 *   assembleContinuationPrompt.
 * Arrange: a payload with continuation_count 0; spied continuation and compression
 *   assemblers.
 * Act:     processCompressJob.
 * Assert:  the compression spy is called once; the continuation spy is never
 *   called.
 */
Deno.test("processCompressJob: continuation_count 0 calls assembleCompressionPrompt and never assembleContinuationPrompt", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({ continuation_count: 0 });
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const continuationSpy = spy(mockBoundAssembleContinuationPrompt);
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleContinuationPrompt: continuationSpy,
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(compressionSpy.calls.length, 1);
    assertEquals(continuationSpy.calls.length, 0);
});

/**
 * Contract: continuation_count absent calls assembleCompressionPrompt and never
 *   assembleContinuationPrompt.
 * Arrange: a payload with no continuation_count; spied continuation and compression
 *   assemblers.
 * Act:     processCompressJob.
 * Assert:  the compression spy is called once; the continuation spy is never
 *   called.
 */
Deno.test("processCompressJob: continuation_count absent calls assembleCompressionPrompt and never assembleContinuationPrompt", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const continuationSpy = spy(mockBoundAssembleContinuationPrompt);
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleContinuationPrompt: continuationSpy,
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(compressionSpy.calls.length, 1);
    assertEquals(continuationSpy.calls.length, 0);
});

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Contract: a fitting job reaches deps.prepareModelJob exactly once with params
 *   { dbClient: params.dbClient } and payload { job: payload.job, providerRow,
 *   promptConstructionPayload }, the providerRow being the ai_providers stub row,
 *   the promptConstructionPayload carrying the assembled promptContent as
 *   currentUserPrompt, the assembled id as source_prompt_resource_id, and empty
 *   conversationHistory and resourceDocuments — and returns { queued: true }.
 * Arrange: a mock Supabase client with a matching step; a compression assembler
 *   spy returning a known assembled prompt; a dispatcher spy returning queued.
 * Act:     processCompressJob.
 * Assert:  the result is { queued: true }; the dispatcher is called once with
 *   params containing only dbClient, payload containing job, providerRow, and
 *   promptConstructionPayload with the assembled content.
 */
Deno.test("processCompressJob: fitting job reaches prepareModelJob once with correct params and payload", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const providerRow = buildMockProvider({ id: compressPayload.model_id });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [providerRow], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const assembled = buildAssembledPrompt({
        promptContent: "assembled-prompt-content",
        source_prompt_resource_id: "assembled-resource-id",
    });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => assembled);
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(result, { queued: true });
    assertEquals(prepareModelJobSpy.calls.length, 1);
    const dispatchParams = prepareModelJobSpy.calls[0].args[0];
    assert(isRecord(dispatchParams));
    assertEquals(dispatchParams["dbClient"], params.dbClient);
    const dispatchPayload = prepareModelJobSpy.calls[0].args[1];
    assert(isRecord(dispatchPayload));
    assertEquals(dispatchPayload["job"], payload.job);
    assertEquals(dispatchPayload["providerRow"], providerRow);
    const promptConstructionPayload = dispatchPayload["promptConstructionPayload"];
    assert(isRecord(promptConstructionPayload));
    assertEquals(promptConstructionPayload["currentUserPrompt"], assembled.promptContent);
    assertEquals(promptConstructionPayload["source_prompt_resource_id"], assembled.source_prompt_resource_id);
    assertEquals(promptConstructionPayload["conversationHistory"], []);
    assertEquals(promptConstructionPayload["resourceDocuments"], []);
});

/**
 * Contract: a dispatcher error return is propagated with the same error identity
 *   and retriable flag, and no further work is done.
 * Arrange: a mock Supabase client with a matching step; a compression assembler
 *   spy returning a valid prompt; a dispatcher spy returning an error return.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with the same error and retriable flag.
 */
Deno.test("processCompressJob: dispatcher error return is propagated unchanged", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const dispatchError = buildPrepareModelJobErrorReturn({
        error: new Error("dispatch failed"),
        retriable: true,
    });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => dispatchError);
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.error, dispatchError.error);
        assertEquals(result.retriable, dispatchError.retriable);
    }
});

/**
 * Contract: a dispatcher deferral returns the non-retriable error arm naming the
 *   COMPRESS deferral, and does not report success.
 * Arrange: a mock Supabase client with a matching step; a compression assembler
 *   spy returning a valid prompt; a dispatcher spy returning a pending (deferral)
 *   return.
 * Act:     processCompressJob.
 * Assert:  the result is the error arm with retriable false and a ProcessCompressJobError;
 *   the result is not { queued: true }.
 */
Deno.test("processCompressJob: dispatcher deferral returns non-retriable error naming COMPRESS deferral", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobPendingReturn());
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    // Assert
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
        assert(result.error instanceof ProcessCompressJobError);
    }
    assertNotEquals(result, { queued: true });
});

// ── Side effects ──────────────────────────────────────────────────────────────

/**
 * Contract: on the dispatch path this function writes no job-row update at all,
 *   the provenance write having moved to the dispatcher.
 * Arrange: a mock Supabase client with a matching step and a succeeding update
 *   mock; a compression assembler spy and dispatcher spy both returning success.
 * Act:     processCompressJob.
 * Assert:  the dialectic_generation_jobs update spy has zero calls.
 */
Deno.test("processCompressJob: dispatch path writes no job-row update", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [buildDialecticStageRecipeStep({
                step_key: "compress",
                step_slug: "compress",
                step_name: "Compress",
                output_type: FileType.business_case,
                step_description: "compress step",
                outputs_required: buildOutputRule({
                    files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
                }),
            })!], error: null } },
            dialectic_generation_jobs: { update: { data: [], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    await processCompressJob(deps, params, payload);

    // Assert
    const updateCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
    assertExists(updateCalls);
    assertEquals(updateCalls.callCount, 0);
});

/**
 * Contract: the first-pass compression call passes the full params census to
 *   assembleCompressionPrompt, all content members read from the narrowed
 *   payload.job.payload.
 * Arrange: a mock Supabase client with a matching step; a spied compression
 *   assembler.
 * Act:     processCompressJob.
 * Assert:  the compression assembler's params carry projectId, sessionId,
 *   iterationNumber, stageSlug, output_type, sourceType, documentKey, modelSlug
 *   from the compress payload, and userId and attemptCount from the job row.
 */
Deno.test("processCompressJob: first-pass call passes the full params census to assembleCompressionPrompt", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload();
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(compressionSpy.calls.length, 1);
    const assembleParams = compressionSpy.calls[0].args[0];
    assert(isRecord(assembleParams));
    assertEquals(assembleParams["projectId"], compressPayload.projectId);
    assertEquals(assembleParams["sessionId"], compressPayload.sessionId);
    assertEquals(assembleParams["iterationNumber"], compressPayload.iterationNumber);
    assertEquals(assembleParams["stageSlug"], compressPayload.stageSlug);
    assertEquals(assembleParams["output_type"], compressPayload.output_type);
    assertEquals(assembleParams["sourceType"], compressPayload.sourceType);
    assertEquals(assembleParams["documentKey"], compressPayload.documentKey);
    assertEquals(assembleParams["modelSlug"], compressPayload.model_slug);
    assertEquals(assembleParams["userId"], payload.job.user_id);
    assertEquals(assembleParams["attemptCount"], payload.job.attempt_count);
});

/**
 * Contract: a history-typed payload reaches dedup layer 2 without throwing and
 *   proceeds to assembly, passing sourceId and role in the storage path context.
 * Arrange: a payload with sourceType history, a sourceId, a role, and no
 *   documentKey; a spied constructStoragePath and compression assembler.
 * Act:     processCompressJob.
 * Assert:  the compression assembler is called once; the storage path context
 *   carries the sourceId and role.
 */
Deno.test("processCompressJob: history payload reaches dedup layer 2 without throwing and proceeds to assembly", async () => {
    // Arrange
    const compressPayload = buildDialecticCompressJobPayload({
        sourceType: "history",
        sourceId: "history-1",
        role: "assistant",
        documentKey: undefined,
    });
    if (!isJson(compressPayload)) {
        throw new Error("Test setup failed: compress payload is not Json-compatible.");
    }
    const payload = buildProcessCompressJobPayload({
        job: buildDialecticJobRow({ job_type: "COMPRESS", payload: compressPayload }),
    });
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: compressPayload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({ id: compressPayload.model_id })], error: null } },
            dialectic_stages: { select: { data: [{ slug: compressPayload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [mockStep], error: null } },
        },
    });
    const params = buildProcessCompressJobParams({
        dbClient: mockSetup.client as unknown as SupabaseClient,
    });
    const baseDeps = buildProcessCompressJobDeps();
    const constructStoragePathSpy = spy(baseDeps.constructStoragePath);
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const prepareModelJobSpy = spy(async (_p: PrepareModelJobParams, _pl: PrepareModelJobPayload): Promise<PrepareModelJobReturn> => buildPrepareModelJobQueuedReturn());
    const deps = buildProcessCompressJobDeps({
        constructStoragePath: constructStoragePathSpy,
        assembleCompressionPrompt: compressionSpy,
        prepareModelJob: prepareModelJobSpy,
    });

    // Act
    await processCompressJob(deps, params, payload);

    // Assert
    assertEquals(compressionSpy.calls.length, 1);
    assertEquals(constructStoragePathSpy.calls.length, 1);
    const storageCtx = constructStoragePathSpy.calls[0].args[0];
    assert(isRecord(storageCtx));
    assertEquals(storageCtx["sourceId"], "history-1");
    assertEquals(storageCtx["role"], "assistant");
    assert(!("documentKey" in storageCtx) || storageCtx["documentKey"] === undefined);
});
