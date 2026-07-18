import { assert, assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isRecord } from "../../_shared/utils/type_guards.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { buildDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import type { EnqueueModelCallParams, EnqueueModelCallPayload, EnqueueModelCallReturn } from "../enqueueModelCall/enqueueModelCall.interface.ts";
import type { AssembleCompressionPromptParams, AssembleCompressionPromptPayload, AssembleCompressionPromptReturn } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import type { CountTokensDeps, CountableChatPayload } from "../../_shared/types/tokenizer.types.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import type {
    DialecticRecipeTemplateStep,
    DialecticStageRecipeStep,
} from "../../dialectic-service/dialectic.interface.ts";
import { processCompressJob } from "./processCompressJob.ts";
import {
    buildProcessCompressJobDeps,
    buildProcessCompressJobParams,
} from "./processCompressJob.mock.ts";
import { ProcessCompressJobReturn } from "./processCompressJob.interface.ts"

Deno.test("processCompressJob: dedup hit marks job completed and returns { queued: false }", async () => {
    const payload = buildDialecticCompressJobPayload();
    const deps = buildProcessCompressJobDeps();
    const expectedPath = deps.constructStoragePath({
        fileType: FileType.CompressedContext,
        projectId: payload.projectId,
        sessionId: payload.sessionId,
        iteration: payload.iterationNumber,
        stageSlug: payload.stageSlug,
        targetKey: payload.targetKey,
        sourceType: payload.sourceType,
        documentKey: payload.documentKey,
        sourceId: payload.sourceId,
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
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const assembleCompressionPromptSpy = spy(deps.assembleCompressionPrompt);
    const enqueueModelCallSpy = spy(deps.enqueueModelCall);
    const testDeps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: assembleCompressionPromptSpy,
        enqueueModelCall: enqueueModelCallSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(testDeps, params, payload);

    assertEquals(result, { queued: false });
    assertEquals(assembleCompressionPromptSpy.calls.length, 0);
    assertEquals(enqueueModelCallSpy.calls.length, 0);
    const resourceEqCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_project_resources", "eq");
    assertExists(resourceEqCalls);
    assertEquals(resourceEqCalls.callCount, 2);
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
    assertEquals(jobEqCalls.callCount, 1);
    assertEquals(jobEqCalls.callsArgs[0], ["id", params.job.id]);
});

Deno.test("processCompressJob: dedup query failure returns retriable error", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: null, error: new Error("dedup read failed") },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const deps = buildProcessCompressJobDeps();

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, true);
    }
});

Deno.test("processCompressJob: ai_providers query failure returns retriable error", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: { data: null, error: new Error("provider read failed") },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const deps = buildProcessCompressJobDeps();

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, true);
    }
});

Deno.test("processCompressJob: invalid provider config returns non-retriable error", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [{
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: { invalid: true },
                    }],
                    error: null,
                },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const deps = buildProcessCompressJobDeps();

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
});

Deno.test("processCompressJob: config missing provider_max_input_tokens returns non-retriable error", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [{
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: {
                            api_identifier: "gpt-4",
                            tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
                            provider_max_output_tokens: 500,
                        },
                    }],
                    error: null,
                },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const deps = buildProcessCompressJobDeps();
    const assembleSpy = spy(deps.assembleCompressionPrompt);
    const enqueueSpy = spy(deps.enqueueModelCall);
    const testDeps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: assembleSpy,
        enqueueModelCall: enqueueSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(testDeps, params, payload);

    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
    assertEquals(assembleSpy.calls.length, 0);
    assertEquals(enqueueSpy.calls.length, 0);
});

Deno.test("processCompressJob: config missing provider_max_output_tokens returns non-retriable error", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [{
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: {
                            api_identifier: "gpt-4",
                            tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
                            provider_max_input_tokens: 1000,
                        },
                    }],
                    error: null,
                },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const deps = buildProcessCompressJobDeps();
    const assembleSpy = spy(deps.assembleCompressionPrompt);
    const enqueueSpy = spy(deps.enqueueModelCall);
    const testDeps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: assembleSpy,
        enqueueModelCall: enqueueSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(testDeps, params, payload);

    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
    assertEquals(assembleSpy.calls.length, 0);
    assertEquals(enqueueSpy.calls.length, 0);
});

Deno.test("processCompressJob: missing active_recipe_instance_id returns non-retriable error", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [{
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: {
                            api_identifier: "gpt-4",
                            input_token_cost_rate: 0.01,
                            output_token_cost_rate: 0.02,
                            tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        },
                    }],
                    error: null,
                },
            },
            dialectic_stages: {
                select: {
                    data: [{ slug: payload.stageSlug, active_recipe_instance_id: null }],
                    error: null,
                },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const deps = buildProcessCompressJobDeps();

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
});

Deno.test("processCompressJob: no recipe step matching targetKey returns non-retriable error", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockStep: DialecticStageRecipeStep = {
        id: "step-1",
        instance_id: "instance-1",
        template_step_id: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        step_key: "other",
        step_slug: "other",
        step_name: "Other",
        job_type: "EXECUTE",
        prompt_type: "Turn",
        output_type: FileType.PendingFile,
        granularity_strategy: "per_source_document",
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: { files_to_generate: [] },
        parallel_group: null,
        branch_key: null,
        prompt_template_id: null,
        execution_order: null,
        step_description: "other step",
    };
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [{
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: {
                            api_identifier: "gpt-4",
                            input_token_cost_rate: 0.01,
                            output_token_cost_rate: 0.02,
                            tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        },
                    }],
                    error: null,
                },
            },
            dialectic_stages: {
                select: {
                    data: [{ slug: payload.stageSlug, active_recipe_instance_id: "instance-1" }],
                    error: null,
                },
            },
            dialectic_stage_recipe_instances: {
                select: {
                    data: [{ id: "instance-1", is_cloned: true, template_id: null }],
                    error: null,
                },
            },
            dialectic_stage_recipe_steps: {
                select: {
                    data: [mockStep],
                    error: null,
                },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const deps = buildProcessCompressJobDeps();

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
});

Deno.test("processCompressJob: cloned recipe instance resolves consuming step", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockStep: DialecticStageRecipeStep = {
        id: "step-1",
        instance_id: "instance-1",
        template_step_id: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        job_type: "EXECUTE",
        prompt_type: "Turn",
        output_type: FileType.business_case,
        granularity_strategy: "per_source_document",
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: { files_to_generate: [{ from_document_key: payload.targetKey, template_filename: "template.md" }] },
        parallel_group: null,
        branch_key: null,
        prompt_template_id: null,
        execution_order: null,
        step_description: "compress the contribution",
    };
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [{
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: {
                            api_identifier: "gpt-4",
                            input_token_cost_rate: 0.01,
                            output_token_cost_rate: 0.02,
                            tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        },
                    }],
                    error: null,
                },
            },
            dialectic_stages: {
                select: {
                    data: [{ slug: payload.stageSlug, active_recipe_instance_id: "instance-1" }],
                    error: null,
                },
            },
            dialectic_stage_recipe_instances: {
                select: {
                    data: [{ id: "instance-1", is_cloned: true, template_id: null }],
                    error: null,
                },
            },
            dialectic_stage_recipe_steps: {
                select: { data: [mockStep], error: null },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const assembleCompressionPromptSpy = spy(async (_params: AssembleCompressionPromptParams, _payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => ({ prompt: "assembled-prompt" }));
    const enqueueModelCallSpy = spy(async (_params: EnqueueModelCallParams, _payload: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_deps: CountTokensDeps, _payload: CountableChatPayload, _config: AiModelExtendedConfig): number => 10);
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: assembleCompressionPromptSpy,
        enqueueModelCall: enqueueModelCallSpy,
        countTokens: countTokensSpy,
    });

    await processCompressJob(deps, params, payload);

    assertEquals(assembleCompressionPromptSpy.calls.length, 1);
    const assembleParams = assembleCompressionPromptSpy.calls[0].args[0];
    assert(isRecord(assembleParams));
    const consumingStep = assembleParams["consumingStep"];
    assert(isRecord(consumingStep));
    assertEquals(consumingStep["outputs_required"], mockStep.outputs_required);
    assertEquals(consumingStep["step_description"], mockStep.step_description);
    const assemblePayload = assembleCompressionPromptSpy.calls[0].args[1];
    assert(isRecord(assemblePayload));
    assertEquals(assemblePayload["mode"], payload.mode);
    assertEquals(assemblePayload["content"], payload.content);
});

Deno.test("processCompressJob: template recipe instance resolves consuming step", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockStep: DialecticRecipeTemplateStep = {
        id: "step-template-1",
        template_id: "template-1",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        step_number: 1,
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        job_type: "EXECUTE",
        prompt_type: "Turn",
        output_type: FileType.business_case,
        granularity_strategy: "per_source_document",
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: { files_to_generate: [{ from_document_key: payload.targetKey, template_filename: "template.md" }] },
        prompt_template_id: null,
        branch_key: null,
        parallel_group: null,
        step_description: "compress via template",
    };
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [{
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: {
                            api_identifier: "gpt-4",
                            input_token_cost_rate: 0.01,
                            output_token_cost_rate: 0.02,
                            tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        },
                    }],
                    error: null,
                },
            },
            dialectic_stages: {
                select: {
                    data: [{ slug: payload.stageSlug, active_recipe_instance_id: "instance-1" }],
                    error: null,
                },
            },
            dialectic_stage_recipe_instances: {
                select: {
                    data: [{ id: "instance-1", is_cloned: false, template_id: "template-1" }],
                    error: null,
                },
            },
            dialectic_recipe_template_steps: {
                select: { data: [mockStep], error: null },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const assembleCompressionPromptSpy = spy(async (_params: AssembleCompressionPromptParams, _payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => ({ prompt: "assembled-prompt" }));
    const enqueueModelCallSpy = spy(async (_params: EnqueueModelCallParams, _payload: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_deps: CountTokensDeps, _payload: CountableChatPayload, _config: AiModelExtendedConfig): number => 10);
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: assembleCompressionPromptSpy,
        enqueueModelCall: enqueueModelCallSpy,
        countTokens: countTokensSpy,
    });

    await processCompressJob(deps, params, payload);

    assertEquals(assembleCompressionPromptSpy.calls.length, 1);
    const assembleParams = assembleCompressionPromptSpy.calls[0].args[0];
    assert(isRecord(assembleParams));
    const consumingStep = assembleParams["consumingStep"];
    assert(isRecord(consumingStep));
    assertEquals(consumingStep["outputs_required"], mockStep.outputs_required);
    assertEquals(consumingStep["step_description"], mockStep.step_description);
});

Deno.test("processCompressJob: assembleCompressionPrompt error propagates", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockStep: DialecticStageRecipeStep = {
        id: "step-1",
        instance_id: "instance-1",
        template_step_id: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        job_type: "EXECUTE",
        prompt_type: "Turn",
        output_type: FileType.business_case,
        granularity_strategy: "per_source_document",
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: { files_to_generate: [] },
        parallel_group: null,
        branch_key: null,
        prompt_template_id: null,
        execution_order: null,
        step_description: "compress step",
    };
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [{
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: {
                            api_identifier: "gpt-4",
                            input_token_cost_rate: 0.01,
                            output_token_cost_rate: 0.02,
                            tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        },
                    }],
                    error: null,
                },
            },
            dialectic_stages: {
                select: {
                    data: [{ slug: payload.stageSlug, active_recipe_instance_id: "instance-1" }],
                    error: null,
                },
            },
            dialectic_stage_recipe_instances: {
                select: {
                    data: [{ id: "instance-1", is_cloned: true, template_id: null }],
                    error: null,
                },
            },
            dialectic_stage_recipe_steps: {
                select: {
                    data: [mockStep],
                    error: null,
                },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const assembleError = new Error("assembly failed");
    const assembleCompressionPromptSpy = spy(async (_params: AssembleCompressionPromptParams, _payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => ({ error: assembleError, retriable: false }));
    const enqueueModelCallSpy = spy(async (_params: EnqueueModelCallParams, _payload: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: assembleCompressionPromptSpy,
        enqueueModelCall: enqueueModelCallSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals(enqueueModelCallSpy.calls.length, 0);
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.error, assembleError);
        assertEquals(result.retriable, false);
    }
});

Deno.test("processCompressJob: assembled prompt exceeds budget returns non-retriable error", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockStep: DialecticStageRecipeStep = {
        id: "step-1",
        instance_id: "instance-1",
        template_step_id: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        job_type: "EXECUTE",
        prompt_type: "Turn",
        output_type: FileType.business_case,
        granularity_strategy: "per_source_document",
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: { files_to_generate: [] },
        parallel_group: null,
        branch_key: null,
        prompt_template_id: null,
        execution_order: null,
        step_description: "compress step",
    };
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [{
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: {
                            api_identifier: "gpt-4",
                            input_token_cost_rate: 0.01,
                            output_token_cost_rate: 0.02,
                            tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        },
                    }],
                    error: null,
                },
            },
            dialectic_stages: {
                select: {
                    data: [{ slug: payload.stageSlug, active_recipe_instance_id: "instance-1" }],
                    error: null,
                },
            },
            dialectic_stage_recipe_instances: {
                select: {
                    data: [{ id: "instance-1", is_cloned: true, template_id: null }],
                    error: null,
                },
            },
            dialectic_stage_recipe_steps: {
                select: {
                    data: [mockStep],
                    error: null,
                },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const assembleCompressionPromptSpy = spy(async (_params: AssembleCompressionPromptParams, _payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => ({ prompt: "a very long prompt" }));
    const enqueueModelCallSpy = spy(async (_params: EnqueueModelCallParams, _payload: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_deps: CountTokensDeps, _payload: CountableChatPayload, _config: AiModelExtendedConfig): number => 2000);
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: assembleCompressionPromptSpy,
        enqueueModelCall: enqueueModelCallSpy,
        countTokens: countTokensSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals(enqueueModelCallSpy.calls.length, 0);
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
});

Deno.test("processCompressJob: happy path enqueues model call", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockStep: DialecticStageRecipeStep = {
        id: "step-1",
        instance_id: "instance-1",
        template_step_id: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        job_type: "EXECUTE",
        prompt_type: "Turn",
        output_type: FileType.business_case,
        granularity_strategy: "per_source_document",
        config_override: {},
        is_skipped: false,
        object_filter: {},
        output_overrides: {},
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: { files_to_generate: [{ from_document_key: payload.targetKey, template_filename: "template.md" }] },
        parallel_group: null,
        branch_key: null,
        prompt_template_id: null,
        execution_order: null,
        step_description: "compress step",
    };
    const providerRow = {
        id: payload.model_id,
        api_identifier: "gpt-4",
        config: {
            api_identifier: "gpt-4",
            input_token_cost_rate: 0.01,
            output_token_cost_rate: 0.02,
            tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
            provider_max_input_tokens: 1000,
            provider_max_output_tokens: 500,
        },
    };
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: { data: [providerRow], error: null },
            },
            dialectic_stages: {
                select: {
                    data: [{ slug: payload.stageSlug, active_recipe_instance_id: "instance-1" }],
                    error: null,
                },
            },
            dialectic_stage_recipe_instances: {
                select: {
                    data: [{ id: "instance-1", is_cloned: true, template_id: null }],
                    error: null,
                },
            },
            dialectic_stage_recipe_steps: {
                select: { data: [mockStep], error: null },
            },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const assembledPrompt = "assembled-prompt";
    const tokenCount = 10;
    const assembleCompressionPromptSpy = spy(async (_params: AssembleCompressionPromptParams, _payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => ({ prompt: assembledPrompt }));
    const enqueueModelCallSpy = spy(async (_params: EnqueueModelCallParams, _payload: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_deps: CountTokensDeps, _payload: CountableChatPayload, _config: AiModelExtendedConfig): number => tokenCount);
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: assembleCompressionPromptSpy,
        enqueueModelCall: enqueueModelCallSpy,
        countTokens: countTokensSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals(result, { queued: true });
    assertEquals(assembleCompressionPromptSpy.calls.length, 1);
    const enqueueCall = enqueueModelCallSpy.calls[0];
    const enqueueParams = enqueueCall.args[0];
    assert(isRecord(enqueueParams));
    assert(enqueueParams["job"] === params.job);
    assert(enqueueParams["dbClient"] === params.dbClient);
    assertEquals(enqueueParams["output_type"], FileType.CompressedContext);
    assertEquals(enqueueParams["userAuthToken"], params.authToken);
    const userConfig = enqueueParams["userConfig"];
    assert(isRecord(userConfig));
    assertEquals(userConfig["tier_output_cap_tokens"], null);
    const enqueuePayload = enqueueCall.args[1];
    assert(isRecord(enqueuePayload));
    assertEquals(enqueuePayload["preflightInputTokens"], tokenCount);
    const chatApiRequest = enqueuePayload["chatApiRequest"];
    assert(isRecord(chatApiRequest));
    assertEquals(chatApiRequest["message"], assembledPrompt);
    assertEquals(chatApiRequest["providerId"], payload.model_id);
    assertEquals(chatApiRequest["promptId"], "__none__");
    assertEquals(chatApiRequest["max_tokens_to_generate"], providerRow.config.provider_max_output_tokens);
    const completedUpdates = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
    if (completedUpdates) {
        completedUpdates.callsArgs.forEach((call) => {
            const updateData = call[0];
            if (isRecord(updateData)) {
                assertNotEquals(updateData["status"], "completed");
            }
        });
    }
});
