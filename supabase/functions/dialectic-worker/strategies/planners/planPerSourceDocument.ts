// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts
import type { DialecticExecuteJobPayload, GranularityPlannerFn } from "../../../dialectic-service/dialectic.interface.ts";
import { createCanonicalPathParams } from "../canonical_context_builder.ts";

export const planPerSourceDocument: GranularityPlannerFn = (
    sourceDocs,
    parentJob,
    recipeStep
) => {
    const childPayloads: DialecticExecuteJobPayload[] = [];

    for (const doc of sourceDocs) {
        const canonicalPathParams = createCanonicalPathParams([doc], recipeStep.output_type, doc);
        
        const inputs: Record<string, string> = {};
        if(doc.contribution_type) {
            inputs[`${doc.contribution_type}_id`] = doc.id;
        }

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
            canonicalPathParams, // Use the new contract
            document_relationships: { source_group: doc.id },
            inputs,
        };

        childPayloads.push(newPayload);
    }

    return childPayloads;
}; 