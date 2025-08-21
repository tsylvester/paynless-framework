// supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";
import { createCanonicalPathParams } from "../canonical_context_builder.ts";

export const planAllToOne: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    if (sourceDocs.length === 0) {
        return [];
    }

    const documentIds = sourceDocs.map(doc => doc.id);

    const newPayload: DialecticExecuteJobPayload = {
        // Inherit core context
        projectId: parentJob.payload.projectId,
        sessionId: parentJob.payload.sessionId,
        stageSlug: parentJob.payload.stageSlug,
        iterationNumber: parentJob.payload.iterationNumber,
        model_id: parentJob.payload.model_id,
        step_info: parentJob.payload.step_info,
        output_type: recipeStep.output_type,
        canonicalPathParams: createCanonicalPathParams(sourceDocs, recipeStep.output_type, sourceDocs[0]),
        // Set job-specific properties
        job_type: 'execute',
        prompt_template_name: recipeStep.prompt_template_name,
        inputs: {
            document_ids: documentIds,
        }
    };

    return [newPayload];
}; 