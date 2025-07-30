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
        step_info: {
            ...parentJob.payload.step_info,
            status: 'pending',
        },
        
        // Set job-specific properties
        job_type: 'combine',
        prompt_template_name: recipeStep.prompt_template_name,
        output_type: recipeStep.output_type,
                    inputs: {
                document_ids: documentIds,
            },
            isIntermediate: false,
    };

    return [newPayload];
}; 