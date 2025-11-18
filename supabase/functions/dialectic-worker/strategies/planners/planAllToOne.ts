// supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";
import { createCanonicalPathParams } from "../canonical_context_builder.ts";
import { isContributionType } from "../../../_shared/utils/type-guards/type_guards.dialectic.ts";
import { isModelContributionFileType } from "../../../_shared/utils/type-guards/type_guards.file_manager.ts";

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

    if (!recipeStep.prompt_template_id) {
        throw new Error(
            `planAllToOne received an invalid recipe step. Expected a recipe step with a prompt_template_id. Received: ${JSON.stringify(
                recipeStep,
                null,
                2
            )}`
        );
    }

    const documentIds = sourceDocs.map(doc => doc.id);
    const anchorDocument = sourceDocs[0];
    if (!anchorDocument) {
        throw new Error('planAllToOne requires at least one source document to build its payload.');
    }

    if(!isModelContributionFileType(recipeStep.output_type)) {
        throw new Error(`Invalid output_type for planAllToOne: ${recipeStep.output_type}`);
    }
    if(!recipeStep.id) {
        throw new Error(`Invalid recipe step for planAllToOne: id is missing.`);
    }

    const newPayload: DialecticExecuteJobPayload = {
        // Inherit ALL fields from parent job payload (defensive programming)
        projectId: parentJob.payload.projectId,
        sessionId: parentJob.payload.sessionId,
        stageSlug: parentJob.payload.stageSlug,
        iterationNumber: parentJob.payload.iterationNumber,
        model_id: parentJob.payload.model_id,
        model_slug: parentJob.payload.model_slug,
        user_jwt: parentJob.payload.user_jwt,
        walletId: parentJob.payload.walletId,
        continueUntilComplete: parentJob.payload.continueUntilComplete,
        maxRetries: parentJob.payload.maxRetries,
        continuation_count: parentJob.payload.continuation_count,
        target_contribution_id: parentJob.payload.target_contribution_id,
        is_test_job: parentJob.payload.is_test_job,
        sourceContributionId: anchorDocument.id,
        // Override job-specific properties
        job_type: 'execute',
        prompt_template_id: recipeStep.prompt_template_id,
        output_type: recipeStep.output_type,
        canonicalPathParams: createCanonicalPathParams(sourceDocs, recipeStep.output_type, anchorDocument, stageSlug),
        inputs: {
            document_ids: documentIds,
        },
        planner_metadata: { recipe_step_id: recipeStep.id },
    };

    return [newPayload];
}; 


