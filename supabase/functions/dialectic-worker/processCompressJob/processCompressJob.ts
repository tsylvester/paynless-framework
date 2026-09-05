import { FileType } from "../../_shared/types/file_manager.types.ts";
import type { PathContext } from "../../_shared/types/file_manager.types.ts";
import type { PostgrestError } from "npm:@supabase/supabase-js@2";
import type { Tables, TablesUpdate } from "../../types_db.ts";
import type { DialecticJobRow, DialecticRecipeStep, PromptConstructionPayload } from "../../dialectic-service/dialectic.interface.ts";
import type { ConstructedPath } from "../../_shared/utils/path_constructor.ts";
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
import { isAssembleContinuationPromptErrorReturn } from "../../_shared/prompt-assembler/prompt-assembler.guard.ts";
import { isDialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.guard.ts";
import type { DialecticCompressJobPayload } from "../enqueueCompressJobs/enqueueCompressJobs.interface.ts";
import type { PrepareModelJobParams, PrepareModelJobPayload } from "../prepareModelJob/prepareModelJob.interface.ts";
import {
    ProcessCompressJobError,
    ProcessCompressJobFn,
} from "./processCompressJob.interface.ts";
import { isProcessCompressJobPayload } from "./processCompressJob.guard.ts";

export const processCompressJob: ProcessCompressJobFn = async (
    deps,
    params,
    payload,
) => {
    // Entry — narrow the payload wrapper
    if (!isProcessCompressJobPayload(payload)) {
        return {
            error: new ProcessCompressJobError("Invalid process compress job payload"),
            retriable: false,
        };
    }
    const job: DialecticJobRow = payload.job;

    // Entry — narrow the job's payload content
    let compressPayload: DialecticCompressJobPayload;
    try {
        if (!isDialecticCompressJobPayload(job.payload)) {
            return {
                error: new ProcessCompressJobError("Invalid compress payload"),
                retriable: false,
            };
        }
        compressPayload = job.payload;
    } catch (err) {
        const error: Error = err instanceof Error
            ? err
            : new ProcessCompressJobError(String(err));
        return { error, retriable: false };
    }

    // Step 1 — dedup layer 2
    let storagePath: string;
    let fileName: string;
    try {
        const pathContext: PathContext = {
            fileType: FileType.CompressedContext,
            projectId: compressPayload.projectId,
            sessionId: compressPayload.sessionId,
            iteration: compressPayload.iterationNumber,
            stageSlug: compressPayload.stageSlug,
            output_type: compressPayload.output_type,
            sourceType: compressPayload.sourceType,
            documentKey: compressPayload.documentKey,
            sourceId: compressPayload.sourceId,
            role: compressPayload.role,
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
            .eq("id", job.id);

        if (updateError) {
            return { error: updateError, retriable: true };
        }

        return { queued: false };
    }

    // Step 2 — provider lookup
    const { data: providerRow, error: providerError } = await params.dbClient
        .from("ai_providers")
        .select("*")
        .eq("id", compressPayload.model_id)
        .maybeSingle();

    if (providerError) {
        return { error: providerError, retriable: true };
    }

    if (!providerRow) {
        return {
            error: new ProcessCompressJobError("Provider not found"),
            retriable: true,
        };
    }

    // Step 3 — consuming step lookup
    const { data: stage, error: stageError } = await params.dbClient
        .from("dialectic_stages")
        .select("active_recipe_instance_id")
        .eq("slug", compressPayload.stageSlug)
        .single();

    if (stageError) {
        return { error: stageError, retriable: true };
    }

    if (!stage || stage.active_recipe_instance_id === null) {
        return {
            error: new ProcessCompressJobError(
                `Stage '${compressPayload.stageSlug}' has no active recipe instance`,
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

    const matchingStep = steps.find((step) => step.output_type === compressPayload.output_type);

    if (!matchingStep) {
        return {
            error: new ProcessCompressJobError(
                `No recipe step with output_type '${compressPayload.output_type}'`,
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
                `Recipe step with output_type '${compressPayload.output_type}' is not a valid compress recipe step`,
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
                `Recipe step with output_type '${compressPayload.output_type}' has missing or invalid outputs_required`,
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
        mode: compressPayload.mode,
        content: compressPayload.content,
    };

    if (
        typeof compressPayload.chunk_index === "number" &&
        typeof compressPayload.chunk_total === "number"
    ) {
        assemblePayload.chunk_index = compressPayload.chunk_index;
        assemblePayload.chunk_total = compressPayload.chunk_total;
    }

    const assembleParams: AssembleCompressionPromptParams = {
        consumingStep,
        projectId: compressPayload.projectId,
        sessionId: compressPayload.sessionId,
        iterationNumber: compressPayload.iterationNumber,
        stageSlug: compressPayload.stageSlug,
        output_type: compressPayload.output_type,
        sourceType: compressPayload.sourceType,
        documentKey: compressPayload.documentKey,
        sourceId: compressPayload.sourceId,
        role: compressPayload.role,
        modelSlug: compressPayload.model_slug,
        userId: job.user_id,
        attemptCount: job.attempt_count,
    };

    let assembled: AssembledPrompt;
    if (typeof compressPayload.continuation_count === "number" && compressPayload.continuation_count >= 1) {
        const continuationResult = await deps.assembleContinuationPrompt(job);
        if (isAssembleContinuationPromptErrorReturn(continuationResult)) {
            return { error: continuationResult.error, retriable: continuationResult.retriable };
        }
        assembled = continuationResult;
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

    // Step 5 — dispatch to prepareModelJob
    const promptConstructionPayload: PromptConstructionPayload = {
        conversationHistory: [],
        resourceDocuments: [],
        currentUserPrompt: assembled.promptContent,
        source_prompt_resource_id: assembled.source_prompt_resource_id,
    };

    const dispatchParams: PrepareModelJobParams = {
        dbClient: params.dbClient,
    };
    const dispatchPayload: PrepareModelJobPayload = {
        job: job,
        providerRow,
        promptConstructionPayload,
    };
    const dispatchResult = await deps.prepareModelJob(dispatchParams, dispatchPayload);

    if ("error" in dispatchResult) {
        return { error: dispatchResult.error, retriable: dispatchResult.retriable };
    }

    if ("waiting_for_children" in dispatchResult) {
        return {
            error: new ProcessCompressJobError("COMPRESS deferral: waiting for children"),
            retriable: false,
        };
    }

    return { queued: true };
};
