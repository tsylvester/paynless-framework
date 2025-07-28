// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";

export const planPerSourceDocument: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    const childPayloads: DialecticExecuteJobPayload[] = [];

    for (const doc of sourceDocs) {
        const newPayload: DialecticExecuteJobPayload = {
            // Inherit core context from the parent
            projectId: parentJob.payload.projectId,
            sessionId: parentJob.payload.sessionId,
            stageSlug: parentJob.payload.stageSlug,
            iterationNumber: parentJob.payload.iterationNumber,
            model_id: parentJob.payload.model_id,
            step_info: parentJob.payload.step_info,
            
            // Set job-specific properties
            job_type: 'execute',
            prompt_template_name: recipeStep.prompt_template_name,
            output_type: recipeStep.output_type,
            inputs: {
                source_id: doc.id,
            }
        };

        childPayloads.push(newPayload);
    }

    return childPayloads;
}; 