import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { PathContext } from "../../_shared/types/file_manager.types.ts";
import type { PostgrestError } from "npm:@supabase/supabase-js@2";
import type { Tables, TablesUpdate } from "../../types_db.ts";
import type { DialecticRecipeStep } from "../../dialectic-service/dialectic.interface.ts";
import type { AiModelExtendedConfig, ChatApiRequest } from "../../_shared/types.ts";
import type { ConstructedPath } from "../../_shared/utils/path_constructor.ts";
import { isAiModelExtendedConfig } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isJson } from "../../_shared/utils/type-guards/type_guards.common.ts";
import { isOutputRule } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import {
    isDialecticRecipeTemplateStep,
    isDialecticStageRecipeStep,
} from "../../_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
import type {
    AssembleCompressionPromptParams,
    AssembleCompressionPromptPayload,
    CompressionTargetStep,
} from "../../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.interface.ts";
import type { AssembledPrompt } from "../../_shared/prompt-assembler/prompt-assembler.interface.ts";
import type {
    CountTokensDeps,
    CountableChatPayload,
} from "../../_shared/types/tokenizer.types.ts";
import type {
    EnqueueModelCallParams,
    EnqueueModelCallPayload,
} from "../enqueueModelCall/enqueueModelCall.interface.ts";
import type { UserConfig } from "../calculateAffordability/calculateAffordability.interface.ts";
import type { DialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.interface.ts";
import {
    ProcessCompressJobError,
    ProcessCompressJobFn,
} from "./processCompressJob.interface.ts";

export const processCompressJob: ProcessCompressJobFn = async (
    deps,
    params,
    payload,
) => {
    // Step 1 — dedup layer 2
    let storagePath: string;
    let fileName: string;
    try {
        const pathContext: PathContext = {
            fileType: FileType.CompressedContext,
            projectId: payload.projectId,
            sessionId: payload.sessionId,
            iteration: payload.iterationNumber,
            stageSlug: payload.stageSlug,
            targetKey: payload.targetKey,
            sourceType: payload.sourceType,
            documentKey: payload.documentKey,
            sourceId: payload.sourceId,
            role: payload.role,
        };
        const constructed: ConstructedPath = deps.constructStoragePath(pathContext);
        storagePath = constructed.storagePath;
        fileName = constructed.fileName;
    } catch (err) {
        let utilError: Error;
        if (err instanceof Error) {
            utilError = err;
        } else {
            utilError = new ProcessCompressJobError(String(err));
        }
        return { error: utilError, retriable: false };
    }

    const { data: existingResource, error: existenceError } = await params.dbClient
        .from("dialectic_project_resources")
        .select("id")
        .eq("storage_path", storagePath)
        .eq("file_name", fileName)
        .maybeSingle();

    if (existenceError) {
        return { error: existenceError, retriable: true };
    }

    if (existingResource) {
        const updatePayload: TablesUpdate<"dialectic_generation_jobs"> = {
            status: "completed",
            completed_at: new Date().toISOString(),
        };
        const { error: updateError } = await params.dbClient
            .from("dialectic_generation_jobs")
            .update(updatePayload)
            .eq("id", params.job.id);

        if (updateError) {
            return { error: updateError, retriable: true };
        }

        return { queued: false };
    }

    // Step 2 — provider lookup and validation
    const { data: providerRow, error: providerError } = await params.dbClient
        .from("ai_providers")
        .select("*")
        .eq("id", payload.model_id)
        .single();

    if (providerError) {
        return { error: providerError, retriable: true };
    }

    if (!providerRow) {
        return {
            error: new ProcessCompressJobError("Provider not found"),
            retriable: true,
        };
    }

    if (!isAiModelExtendedConfig(providerRow.config)) {
        return {
            error: new ProcessCompressJobError(
                "Provider config is not a valid AiModelExtendedConfig",
            ),
            retriable: false,
        };
    }

    const providerConfig: AiModelExtendedConfig = providerRow.config;

    if (providerConfig.provider_max_input_tokens === undefined) {
        return {
            error: new ProcessCompressJobError(
                "provider_max_input_tokens is missing",
            ),
            retriable: false,
        };
    }

    if (providerConfig.provider_max_output_tokens === undefined) {
        return {
            error: new ProcessCompressJobError(
                "provider_max_output_tokens is missing",
            ),
            retriable: false,
        };
    }

    const maxInputTokens: number = providerConfig.provider_max_input_tokens;
    const maxOutputTokens: number = providerConfig.provider_max_output_tokens;

    // Step 3 — consuming step lookup
    const { data: stage, error: stageError } = await params.dbClient
        .from("dialectic_stages")
        .select("active_recipe_instance_id")
        .eq("slug", payload.stageSlug)
        .single();

    if (stageError) {
        return { error: stageError, retriable: true };
    }

    if (!stage || stage.active_recipe_instance_id === null) {
        return {
            error: new ProcessCompressJobError(
                `Stage '${payload.stageSlug}' has no active recipe instance`,
            ),
            retriable: false,
        };
    }

    const { data: instance, error: instanceError } = await params.dbClient
        .from("dialectic_stage_recipe_instances")
        .select("*")
        .eq("id", stage.active_recipe_instance_id)
        .single();

    if (instanceError) {
        return { error: instanceError, retriable: true };
    }

    if (!instance) {
        return {
            error: new ProcessCompressJobError("Recipe instance not found"),
            retriable: true,
        };
    }

    let steps: DialecticRecipeStep[];

    if (instance.is_cloned === true) {
        const { data, error }: {
            data: Tables<"dialectic_stage_recipe_steps">[] | null;
            error: PostgrestError | null;
        } = await params.dbClient
            .from("dialectic_stage_recipe_steps")
            .select("*")
            .eq("instance_id", instance.id);

        if (error) {
            return { error, retriable: true };
        }

        if (data === null) {
            return {
                error: new ProcessCompressJobError(
                    "Recipe steps query returned no data",
                ),
                retriable: true,
            };
        }

        const validSteps: DialecticRecipeStep[] = [];
        for (const row of data) {
            if (
                isDialecticStageRecipeStep(row) ||
                isDialecticRecipeTemplateStep(row)
            ) {
                validSteps.push(row);
            }
        }
        steps = validSteps;
    } else {
        const { data, error }: {
            data: Tables<"dialectic_recipe_template_steps">[] | null;
            error: PostgrestError | null;
        } = await params.dbClient
            .from("dialectic_recipe_template_steps")
            .select("*")
            .eq("template_id", instance.template_id);

        if (error) {
            return { error, retriable: true };
        }

        if (data === null) {
            return {
                error: new ProcessCompressJobError(
                    "Recipe steps query returned no data",
                ),
                retriable: true,
            };
        }

        const validSteps: DialecticRecipeStep[] = [];
        for (const row of data) {
            if (
                isDialecticStageRecipeStep(row) ||
                isDialecticRecipeTemplateStep(row)
            ) {
                validSteps.push(row);
            }
        }
        steps = validSteps;
    }

    if (steps.length === 0) {
        return {
            error: new ProcessCompressJobError("No recipe steps found"),
            retriable: false,
        };
    }

    const matchingStep = steps.find((step) => step.output_type === payload.targetKey);

    if (!matchingStep) {
        return {
            error: new ProcessCompressJobError(
                `No recipe step with output_type '${payload.targetKey}'`,
            ),
            retriable: false,
        };
    }

    if (
        !isDialecticStageRecipeStep(matchingStep) &&
        !isDialecticRecipeTemplateStep(matchingStep)
    ) {
        return {
            error: new ProcessCompressJobError(
                `Recipe step with output_type '${payload.targetKey}' is not a valid compress recipe step`,
            ),
            retriable: false,
        };
    }

    const outputsRequired = matchingStep.outputs_required;
    if (
        !isJson(outputsRequired) ||
        !isOutputRule(outputsRequired) ||
        Object.keys(outputsRequired).length === 0
    ) {
        return {
            error: new ProcessCompressJobError(
                `Recipe step with output_type '${payload.targetKey}' has missing or invalid outputs_required`,
            ),
            retriable: false,
        };
    }

    const stepDescription: string | null = matchingStep.step_description;

    const consumingStep: CompressionTargetStep = {
        outputs_required: outputsRequired,
        step_description: stepDescription,
    };

    // Step 4 — assemble compression prompt
    const assemblePayload: AssembleCompressionPromptPayload = {
        mode: payload.mode,
        content: payload.content,
    };

    if (
        typeof payload.chunk_index === "number" &&
        typeof payload.chunk_total === "number"
    ) {
        assemblePayload.chunk_index = payload.chunk_index;
        assemblePayload.chunk_total = payload.chunk_total;
    }

    const assembleParams: AssembleCompressionPromptParams = {
        consumingStep,
        projectId: payload.projectId,
        sessionId: payload.sessionId,
        iterationNumber: payload.iterationNumber,
        stageSlug: payload.stageSlug,
        targetKey: payload.targetKey,
        sourceType: payload.sourceType,
        documentKey: payload.documentKey,
        sourceId: payload.sourceId,
        role: payload.role,
        modelSlug: payload.model_slug,
        userId: payload.user_id,
        attemptCount: params.job.attempt_count,
    };

    let assembled: AssembledPrompt;
    if (typeof payload.continuation_count === "number" && payload.continuation_count >= 1) {
        assembled = await deps.assembleContinuationPrompt(params.job);
    } else {
        const compressionResult = await deps.assembleCompressionPrompt(
            assembleParams,
            assemblePayload,
        );
        if ("error" in compressionResult) {
            return { error: compressionResult.error, retriable: compressionResult.retriable };
        }
        assembled = compressionResult;
    }

    // Step 5 — provenance write
    const updatedPayload: DialecticCompressJobPayload = {
        ...payload,
        source_prompt_resource_id: assembled.source_prompt_resource_id,
    };

    if(!isJson(updatedPayload)){
        throw new Error ("DialecticCompressJobPayload just be Json compatible")
    }
    const provenanceUpdate: TablesUpdate<"dialectic_generation_jobs"> = {
        payload: updatedPayload,
    };
    const { error: provenanceError } = await params.dbClient
        .from("dialectic_generation_jobs")
        .update(provenanceUpdate)
        .eq("id", params.job.id);

    if (provenanceError) {
        return { error: provenanceError, retriable: true };
    }

    // Step 6 — recursion guard
    const tokenizerDeps: CountTokensDeps = {
        getEncoding: deps.getEncoding,
        countTokensAnthropic: deps.countTokensAnthropic,
        logger: deps.logger,
    };

    const countablePayload: CountableChatPayload = { message: assembled.promptContent };
    const preflightInputTokens = deps.countTokens(
        tokenizerDeps,
        countablePayload,
        providerConfig,
    );

    if (preflightInputTokens > maxInputTokens - 32) {
        return {
            error: new ProcessCompressJobError(
                `Assembled prompt of ${preflightInputTokens} tokens exceeds budget of ${maxInputTokens - 32}`,
            ),
            retriable: false,
        };
    }

    // Step 6 — enqueue model call
    const chatApiRequest: ChatApiRequest = {
        message: assembled.promptContent,
        providerId: payload.model_id,
        promptId: "__none__",
        max_tokens_to_generate: maxOutputTokens,
    };

    const userConfigObject: UserConfig = { tier_output_cap_tokens: null };
    const enqueueParams: EnqueueModelCallParams = {
        dbClient: params.dbClient,
        job: params.job,
        providerRow,
        userAuthToken: params.authToken,
        output_type: FileType.CompressedContextRawJson,
        userConfig: userConfigObject,
    };
    const enqueuePayload: EnqueueModelCallPayload = {
        chatApiRequest,
        preflightInputTokens,
    };
    const enqueued = await deps.enqueueModelCall(enqueueParams, enqueuePayload);

    if ("error" in enqueued) {
        return { error: enqueued.error, retriable: enqueued.retriable };
    }

    return { queued: true };
};
