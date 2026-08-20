import { assert, assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { ModelContributionFileTypes } from "../../_shared/types/file_manager.types.ts";
import { isRecord } from "../../_shared/utils/type_guards.ts";
import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts";
import { buildDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.mock.ts";
import { buildAssembledPrompt } from "../../_shared/prompt-assembler/prompt-assembler.mock.ts";
import { mockBoundAssembleContinuationPrompt } from "../../_shared/prompt-assembler/assembleContinuationPrompt/assembleContinuationPrompt.mock.ts";
import { buildMockProvider, buildExtendedModelConfig } from "../../_shared/ai_service/ai_provider.mock.ts";
import {
    buildDialecticStageRecipeStep,
    buildDialecticRecipeTemplateStep,
    buildOutputRule,
} from "../../_shared/dialectic.mock.ts";
import type { EnqueueModelCallParams, EnqueueModelCallPayload, EnqueueModelCallReturn } from "../enqueueModelCall/enqueueModelCall.interface.ts";
import type { AssembleCompressionPromptParams, AssembleCompressionPromptPayload, AssembleCompressionPromptReturn } from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import type { AssembledPrompt, BoundAssembleContinuationPromptFn } from "../../_shared/prompt-assembler/prompt-assembler.interface.ts";
import type { CountTokensDeps, CountableChatPayload } from "../../_shared/types/tokenizer.types.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
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
        output_type: payload.output_type,
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
                    data: [buildMockProvider({
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: { invalid: true } as unknown as AiModelExtendedConfig,
                    })],
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
                    data: [buildMockProvider({
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: buildExtendedModelConfig({
                            api_identifier: "gpt-4",
                            provider_max_input_tokens: undefined,
                            provider_max_output_tokens: 500,
                        }),
                    })],
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
                    data: [buildMockProvider({
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: buildExtendedModelConfig({
                            api_identifier: "gpt-4",
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: undefined,
                        }),
                    })],
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
                    data: [buildMockProvider({
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: buildExtendedModelConfig({
                            api_identifier: "gpt-4",
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        }),
                    })],
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

Deno.test("processCompressJob: no recipe step matching output_type returns non-retriable error", async () => {
    const payload = buildDialecticCompressJobPayload();
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
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [buildMockProvider({
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: buildExtendedModelConfig({
                            api_identifier: "gpt-4",
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        }),
                    })],
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
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress the contribution",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: payload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [buildMockProvider({
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: buildExtendedModelConfig({
                            api_identifier: "gpt-4",
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        }),
                    })],
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
    const assembleCompressionPromptSpy = spy(async (_params: AssembleCompressionPromptParams, _payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
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
    const mockStep = buildDialecticRecipeTemplateStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress via template",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: payload.output_type, template_filename: "template.md" }],
        }),
    });
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [buildMockProvider({
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: buildExtendedModelConfig({
                            api_identifier: "gpt-4",
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        }),
                    })],
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
    const assembleCompressionPromptSpy = spy(async (_params: AssembleCompressionPromptParams, _payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
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
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({ files_to_generate: [] }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [buildMockProvider({
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: buildExtendedModelConfig({
                            api_identifier: "gpt-4",
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        }),
                    })],
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
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({ files_to_generate: [] }),
    })!;
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: {
                select: { data: [], error: null },
            },
            ai_providers: {
                select: {
                    data: [buildMockProvider({
                        id: payload.model_id,
                        api_identifier: "gpt-4",
                        config: buildExtendedModelConfig({
                            api_identifier: "gpt-4",
                            provider_max_input_tokens: 1000,
                            provider_max_output_tokens: 500,
                        }),
                    })],
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
    const assembleCompressionPromptSpy = spy(async (_params: AssembleCompressionPromptParams, _payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt({ promptContent: "a very long prompt" }));
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
    const mockStep = buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({
            files_to_generate: [{ from_document_key: payload.output_type, template_filename: "template.md" }],
        }),
    })!;
    const providerRow = buildMockProvider({
        id: payload.model_id,
        api_identifier: "gpt-4",
        config: buildExtendedModelConfig({
            api_identifier: "gpt-4",
            provider_max_input_tokens: 1000,
            provider_max_output_tokens: 500,
        }),
    });
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
    const assembledPrompt: AssembledPrompt = buildAssembledPrompt({ promptContent: "assembled-prompt" });
    const tokenCount = 10;
    const assembleCompressionPromptSpy = spy(async (_params: AssembleCompressionPromptParams, _payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => assembledPrompt);
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
    assertEquals(enqueueParams["output_type"], FileType.CompressedContextRawJson);
    assertEquals(enqueueParams["userAuthToken"], params.authToken);
    const userConfig = enqueueParams["userConfig"];
    assert(isRecord(userConfig));
    assertEquals(userConfig["tier_output_cap_tokens"], null);
    const enqueuePayload = enqueueCall.args[1];
    assert(isRecord(enqueuePayload));
    assertEquals(enqueuePayload["preflightInputTokens"], tokenCount);
    const chatApiRequest = enqueuePayload["chatApiRequest"];
    assert(isRecord(chatApiRequest));
    assertEquals(chatApiRequest["message"], assembledPrompt.promptContent);
    assertEquals(chatApiRequest["providerId"], payload.model_id);
    assertEquals(chatApiRequest["promptId"], "__none__");
    assertEquals(chatApiRequest["max_tokens_to_generate"], buildExtendedModelConfig({ provider_max_output_tokens: 500 }).provider_max_output_tokens);
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

// ── New tests for continuation routing, census, history victim, provenance write ──

function buildCompressMockStep(payload: { output_type: ModelContributionFileTypes }, filesToGenerate: { from_document_key: string; template_filename: string }[] = []) {
    return buildDialecticStageRecipeStep({
        step_key: "compress",
        step_slug: "compress",
        step_name: "Compress",
        output_type: FileType.business_case,
        step_description: "compress step",
        outputs_required: buildOutputRule({ files_to_generate: filesToGenerate.length > 0 ? filesToGenerate : [{ from_document_key: payload.output_type, template_filename: "template.md" }] }),
    })!;
}

function buildCompressMockSetup(payload: { model_id: string; stageSlug: string; output_type: ModelContributionFileTypes }, isCloned = true) {
    return createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({
                id: payload.model_id,
                api_identifier: "gpt-4",
                config: buildExtendedModelConfig({
                    api_identifier: "gpt-4",
                    provider_max_input_tokens: 1000,
                    provider_max_output_tokens: 500,
                }),
            })], error: null } },
            dialectic_stages: { select: { data: [{ slug: payload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: isCloned, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [buildCompressMockStep(payload)], error: null } },
        },
    });
}

Deno.test("processCompressJob: payload with continuation_count >= 1 calls assembleContinuationPrompt and never assembleCompressionPrompt", async () => {
    const payload = buildDialecticCompressJobPayload({ continuation_count: 1 });
    const mockSetup = buildCompressMockSetup(payload);
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const continuationSpy = spy(mockBoundAssembleContinuationPrompt);
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const enqueueSpy = spy(async (_p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_d: CountTokensDeps, _p: CountableChatPayload, _c: AiModelExtendedConfig): number => 10);
    const deps = buildProcessCompressJobDeps({
        assembleContinuationPrompt: continuationSpy,
        assembleCompressionPrompt: compressionSpy,
        enqueueModelCall: enqueueSpy,
        countTokens: countTokensSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals(result, { queued: true });
    assertEquals(continuationSpy.calls.length, 1);
    assertEquals(compressionSpy.calls.length, 0);
    const enqueuePayload = enqueueSpy.calls[0].args[1];
    assert(isRecord(enqueuePayload));
    const chatApiRequest = enqueuePayload["chatApiRequest"];
    assert(isRecord(chatApiRequest));
    const expectedContinuation = await mockBoundAssembleContinuationPrompt(params.job);
    assertEquals(chatApiRequest["message"], expectedContinuation.promptContent);
});

Deno.test("processCompressJob: payload with continuation_count 0 calls assembleCompressionPrompt and never assembleContinuationPrompt", async () => {
    const payload = buildDialecticCompressJobPayload({ continuation_count: 0 });
    const mockSetup = buildCompressMockSetup(payload);
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const continuationSpy = spy(mockBoundAssembleContinuationPrompt);
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const enqueueSpy = spy(async (_p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_d: CountTokensDeps, _p: CountableChatPayload, _c: AiModelExtendedConfig): number => 10);
    const deps = buildProcessCompressJobDeps({
        assembleContinuationPrompt: continuationSpy,
        assembleCompressionPrompt: compressionSpy,
        enqueueModelCall: enqueueSpy,
        countTokens: countTokensSpy,
    });

    await processCompressJob(deps, params, payload);

    assertEquals(compressionSpy.calls.length, 1);
    assertEquals(continuationSpy.calls.length, 0);
});

Deno.test("processCompressJob: payload omitting continuation_count calls assembleCompressionPrompt and never assembleContinuationPrompt", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = buildCompressMockSetup(payload);
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const continuationSpy = spy(mockBoundAssembleContinuationPrompt);
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const enqueueSpy = spy(async (_p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_d: CountTokensDeps, _p: CountableChatPayload, _c: AiModelExtendedConfig): number => 10);
    const deps = buildProcessCompressJobDeps({
        assembleContinuationPrompt: continuationSpy,
        assembleCompressionPrompt: compressionSpy,
        enqueueModelCall: enqueueSpy,
        countTokens: countTokensSpy,
    });

    await processCompressJob(deps, params, payload);

    assertEquals(compressionSpy.calls.length, 1);
    assertEquals(continuationSpy.calls.length, 0);
});

Deno.test("processCompressJob: continuation whose assembled prompt exceeds budget returns non-retriable error and enqueues nothing", async () => {
    const payload = buildDialecticCompressJobPayload({ continuation_count: 1 });
    const mockSetup = buildCompressMockSetup(payload);
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const continuationFn: BoundAssembleContinuationPromptFn = async (_job) => buildAssembledPrompt({ promptContent: "a very long prompt" });
    const continuationSpy = spy(continuationFn);
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const enqueueSpy = spy(async (_p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_d: CountTokensDeps, _p: CountableChatPayload, _c: AiModelExtendedConfig): number => 2000);
    const deps = buildProcessCompressJobDeps({
        assembleContinuationPrompt: continuationSpy,
        assembleCompressionPrompt: compressionSpy,
        enqueueModelCall: enqueueSpy,
        countTokens: countTokensSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals(enqueueSpy.calls.length, 0);
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, false);
    }
});

Deno.test("processCompressJob: first-pass call passes the full params census to assembleCompressionPrompt", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = buildCompressMockSetup(payload);
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const enqueueSpy = spy(async (_p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_d: CountTokensDeps, _p: CountableChatPayload, _c: AiModelExtendedConfig): number => 10);
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        enqueueModelCall: enqueueSpy,
        countTokens: countTokensSpy,
    });

    await processCompressJob(deps, params, payload);

    assertEquals(compressionSpy.calls.length, 1);
    const assembleParams = compressionSpy.calls[0].args[0];
    assert(isRecord(assembleParams));
    assertEquals(assembleParams["projectId"], payload.projectId);
    assertEquals(assembleParams["sessionId"], payload.sessionId);
    assertEquals(assembleParams["iterationNumber"], payload.iterationNumber);
    assertEquals(assembleParams["stageSlug"], payload.stageSlug);
    assertEquals(assembleParams["output_type"], payload.output_type);
    assertEquals(assembleParams["sourceType"], payload.sourceType);
    assertEquals(assembleParams["documentKey"], payload.documentKey);
    assertEquals(assembleParams["modelSlug"], payload.model_slug);
    assertEquals(assembleParams["userId"], payload.user_id);
    assertEquals(assembleParams["attemptCount"], params.job.attempt_count);
});

Deno.test("processCompressJob: history payload reaches dedup layer 2 without throwing and proceeds to assembly", async () => {
    const payload = buildDialecticCompressJobPayload({ sourceType: "history", sourceId: "history-1", role: "assistant", documentKey: undefined });
    const mockSetup = buildCompressMockSetup(payload);
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const baseDeps = buildProcessCompressJobDeps();
    const constructStoragePathSpy = spy(baseDeps.constructStoragePath);
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const enqueueSpy = spy(async (_p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_d: CountTokensDeps, _p: CountableChatPayload, _c: AiModelExtendedConfig): number => 10);
    const deps = buildProcessCompressJobDeps({
        constructStoragePath: constructStoragePathSpy,
        assembleCompressionPrompt: compressionSpy,
        enqueueModelCall: enqueueSpy,
        countTokens: countTokensSpy,
    });

    await processCompressJob(deps, params, payload);

    assertEquals(compressionSpy.calls.length, 1);
    assertEquals(constructStoragePathSpy.calls.length, 1);
    const storageCtx = constructStoragePathSpy.calls[0].args[0];
    assert(isRecord(storageCtx));
    assertEquals(storageCtx["sourceId"], "history-1");
    assertEquals(storageCtx["role"], "assistant");
    assert(!("documentKey" in storageCtx) || storageCtx["documentKey"] === undefined);
});

Deno.test("processCompressJob: successful assembly updates job row payload with source_prompt_resource_id before enqueue", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({
                id: payload.model_id,
                api_identifier: "gpt-4",
                config: buildExtendedModelConfig({
                    api_identifier: "gpt-4",
                    provider_max_input_tokens: 1000,
                    provider_max_output_tokens: 500,
                }),
            })], error: null } },
            dialectic_stages: { select: { data: [{ slug: payload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [buildCompressMockStep(payload)], error: null } },
            dialectic_generation_jobs: { update: { data: [], error: null } },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const assembled = buildAssembledPrompt({ source_prompt_resource_id: "assembler-returned-id" });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => assembled);
    const enqueueSpy = spy(async (_p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => {
        const updateCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
        assertExists(updateCalls);
        assertEquals(updateCalls.callCount, 1);
        return { queued: true };
    });
    const countTokensSpy = spy((_d: CountTokensDeps, _p: CountableChatPayload, _c: AiModelExtendedConfig): number => 10);
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        enqueueModelCall: enqueueSpy,
        countTokens: countTokensSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals(result, { queued: true });
    const updateCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
    assertExists(updateCalls);
    assertEquals(updateCalls.callCount, 1);
    const updateData = updateCalls.callsArgs[0][0];
    assert(isRecord(updateData));
    const updatePayload = updateData["payload"];
    assert(isRecord(updatePayload));
    assertEquals(updatePayload["source_prompt_resource_id"], "assembler-returned-id");
    const jobEqCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "eq");
    assertExists(jobEqCalls);
    const idEqCall = jobEqCalls.callsArgs.find((c) => c[0] === "id");
    assertExists(idEqCall);
    assertEquals(idEqCall[1], params.job.id);
});

Deno.test("processCompressJob: failing payload update returns retriable error and enqueues nothing", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [], error: null } },
            ai_providers: { select: { data: [buildMockProvider({
                id: payload.model_id,
                api_identifier: "gpt-4",
                config: buildExtendedModelConfig({
                    api_identifier: "gpt-4",
                    provider_max_input_tokens: 1000,
                    provider_max_output_tokens: 500,
                }),
            })], error: null } },
            dialectic_stages: { select: { data: [{ slug: payload.stageSlug, active_recipe_instance_id: "instance-1" }], error: null } },
            dialectic_stage_recipe_instances: { select: { data: [{ id: "instance-1", is_cloned: true, template_id: null }], error: null } },
            dialectic_stage_recipe_steps: { select: { data: [buildCompressMockStep(payload)], error: null } },
            dialectic_generation_jobs: { update: { data: null, error: new Error("payload update failed") } },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const enqueueSpy = spy(async (_p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const countTokensSpy = spy((_d: CountTokensDeps, _p: CountableChatPayload, _c: AiModelExtendedConfig): number => 10);
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        enqueueModelCall: enqueueSpy,
        countTokens: countTokensSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals(enqueueSpy.calls.length, 0);
    assertEquals("error" in result, true);
    if ("error" in result) {
        assertEquals(result.retriable, true);
    }
});

Deno.test("processCompressJob: dedup-hit path performs no payload update and calls neither assembler", async () => {
    const payload = buildDialecticCompressJobPayload();
    const mockSetup = createMockSupabaseClient("process-compress-job", {
        genericMockResults: {
            dialectic_project_resources: { select: { data: [{ id: "existing-resource" }], error: null } },
            dialectic_generation_jobs: { update: { data: [], error: null } },
        },
    });
    const dbClient = mockSetup.client as unknown as SupabaseClient;
    const params = buildProcessCompressJobParams({ dbClient });
    const compressionSpy = spy(async (_p: AssembleCompressionPromptParams, _pl: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn> => buildAssembledPrompt());
    const continuationSpy = spy(mockBoundAssembleContinuationPrompt);
    const enqueueSpy = spy(async (_p: EnqueueModelCallParams, _pl: EnqueueModelCallPayload): Promise<EnqueueModelCallReturn> => ({ queued: true }));
    const deps = buildProcessCompressJobDeps({
        assembleCompressionPrompt: compressionSpy,
        assembleContinuationPrompt: continuationSpy,
        enqueueModelCall: enqueueSpy,
    });

    const result: ProcessCompressJobReturn = await processCompressJob(deps, params, payload);

    assertEquals(result, { queued: false });
    assertEquals(compressionSpy.calls.length, 0);
    assertEquals(continuationSpy.calls.length, 0);
    assertEquals(enqueueSpy.calls.length, 0);
    const updateCalls = mockSetup.spies.getHistoricQueryBuilderSpies("dialectic_generation_jobs", "update");
    assertExists(updateCalls);
    assertEquals(updateCalls.callCount, 1);
    const updateData = updateCalls.callsArgs[0][0];
    assert(isRecord(updateData));
    assertEquals(updateData["status"], "completed");
    assert(!("payload" in updateData) || updateData["payload"] === undefined);
});
