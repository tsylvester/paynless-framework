// supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";
import { createCanonicalPathParams } from "../canonical_context_builder.ts";
import { isDialecticStageRecipeStep } from "../../../_shared/utils/type-guards/type_guards.dialectic.recipe.ts";
import { isContributionType } from "../../../_shared/utils/type-guards/type_guards.dialectic.ts";

export const planAllToOne: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    if (sourceDocs.length === 0) {
        return [];
    }

    const stageSlug = parentJob.payload.stageSlug;
    if (!stageSlug || !isContributionType(stageSlug)) {
        throw new Error(`planAllToOne requires a valid ContributionType stageSlug, but received: ${stageSlug}`);
    }

    if (!isDialecticStageRecipeStep(recipeStep) || !recipeStep.prompt_template_id) {
        throw new Error(
            `planAllToOne received an invalid recipe step. Expected a DialecticStageRecipeStep with a prompt_template_id. Received: ${JSON.stringify(
                recipeStep,
                null,
                2
            )}`
        );
    }

    const documentIds = sourceDocs.map(doc => doc.id);

    const newPayload: DialecticExecuteJobPayload = {
        // Inherit core context
        projectId: parentJob.payload.projectId,
        sessionId: parentJob.payload.sessionId,
        stageSlug: parentJob.payload.stageSlug,
        iterationNumber: parentJob.payload.iterationNumber,
        model_id: parentJob.payload.model_id,
        output_type: recipeStep.output_type,
        canonicalPathParams: createCanonicalPathParams(sourceDocs, recipeStep.output_type, sourceDocs[0], stageSlug),
        // Set job-specific properties
        job_type: 'execute',
        prompt_template_id: recipeStep.prompt_template_id,
        inputs: {
            document_ids: documentIds,
        },
        walletId: parentJob.payload.walletId,
    };

    return [newPayload];
}; 