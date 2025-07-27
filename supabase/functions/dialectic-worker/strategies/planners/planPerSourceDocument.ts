// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts
import type { DialecticCombinationJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";

export const planPerSourceDocument: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    const childJobs = [];

    for (const doc of sourceDocs) {
        const newPayload: DialecticCombinationJobPayload = {
            // Inherit core context from the parent
            projectId: parentJob.payload.projectId,
            sessionId: parentJob.payload.sessionId,
            stageSlug: parentJob.payload.stageSlug,
            iterationNumber: parentJob.payload.iterationNumber,
            model_id: parentJob.payload.model_id,
            
            // Set job-specific properties
            job_type: 'execute',
            prompt_template_name: recipeStep.prompt_template_name,
            inputs: {
                source_id: doc.id,
            }
        };

        childJobs.push({
            parent_job_id: parentJob.id,
            session_id: parentJob.session_id,
            user_id: parentJob.user_id,
            stage_slug: parentJob.stage_slug,
            iteration_number: parentJob.iteration_number,
            max_retries: parentJob.max_retries,
            payload: newPayload,
            target_contribution_id: null, // Not applicable for this planner
        });
    }

    return childJobs;
}; 