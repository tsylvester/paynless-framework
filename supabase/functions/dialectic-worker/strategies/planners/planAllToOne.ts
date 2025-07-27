// supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts
import type { DialecticCombinationJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";

export const planAllToOne: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    if (sourceDocs.length === 0) {
        return [];
    }

    const documentIds = sourceDocs.map(doc => doc.id);

    const newPayload: DialecticCombinationJobPayload = {
        // Inherit core context
        projectId: parentJob.payload.projectId,
        sessionId: parentJob.payload.sessionId,
        stageSlug: parentJob.payload.stageSlug,
        iterationNumber: parentJob.payload.iterationNumber,
        model_id: parentJob.payload.model_id,
        
        // Set job-specific properties
        job_type: 'execute',
        prompt_template_name: recipeStep.prompt_template_name,
        inputs: {
            document_ids: documentIds,
        }
    };

    const childJob = {
        parent_job_id: parentJob.id,
        session_id: parentJob.session_id,
        user_id: parentJob.user_id,
        stage_slug: parentJob.stage_slug,
        iteration_number: parentJob.iteration_number,
        max_retries: parentJob.max_retries,
        payload: newPayload,
        target_contribution_id: null,
    };

    return [childJob];
}; 